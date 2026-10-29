<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EntiteOrganisationnelle;
use App\Services\CourrierNumberingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class NumberingController extends Controller
{
    public function __construct(private CourrierNumberingService $numbering) {}

    private function admin(Request $r): void
    {
        abort_unless($r->user()?->role === 'SUPER_ADMIN', 403, 'Paramétrage réservé à l’administrateur.');
    }

    public function show(Request $r)
    {
        $this->admin($r);
        return response()->json(['data' => $this->numbering->settings() + [
            'entities' => EntiteOrganisationnelle::orderBy('ordre')->orderBy('nom')->get()->map->toArray(),
            'types' => DB::table('entite_type_definitions')->pluck('libelle_singulier', 'code'),
        ]]);
    }

    public function options(Request $r)
    {
        return response()->json(['data' => $this->numbering->settings() + ['entities' => $this->numbering->allowedEntities($r->user())->map->toArray()]]);
    }

    public function save(Request $r)
    {
        $this->admin($r);
        $v = $r->validate([
            'version' => 'present|nullable|integer',
            'settings' => 'required|array:enabled,organisation,timezone,rules',
            'settings.enabled' => 'required|boolean',
            'settings.organisation' => ['required', 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/'],
            'settings.timezone' => 'required|timezone',
            'settings.rules' => 'present|array|max:30',
            'settings.rules.*' => 'required|array:id,name,scopeType,entityId,type,sens,format,period,width,start,splitType,splitSens',
            'settings.rules.*.id' => 'required|uuid|distinct',
            'settings.rules.*.name' => 'required|string|max:100',
            'settings.rules.*.scopeType' => 'required|string|max:40',
            'settings.rules.*.entityId' => 'present|nullable|uuid|exists:entites_organisationnelles,id',
            'settings.rules.*.type' => 'required|in:*,INTERNE,EXTERNE',
            'settings.rules.*.sens' => 'required|in:*,ENTRANT,SORTANT',
            'settings.rules.*.format' => ['required','string','max:150','regex:/^[A-Za-z0-9_{}\/\. -]+$/'],
            'settings.rules.*.period' => 'required|in:year,month,continuous',
            'settings.rules.*.width' => 'required|integer|min:1|max:12',
            'settings.rules.*.start' => 'required|integer|min:1|max:1000000000',
            'settings.rules.*.splitType' => 'required|boolean',
            'settings.rules.*.splitSens' => 'required|boolean',
            'codes' => 'present|array|max:2000',
            'codes.*.id' => 'required|uuid|distinct|exists:entites_organisationnelles,id',
            'codes.*.code' => ['present','nullable','string','max:40','regex:/^[A-Z0-9_-]+$/'],
        ]);
        $types = DB::table('entite_type_definitions')->pluck('code')->all();
        if ($v['settings']['enabled'] && !$v['settings']['rules']) throw ValidationException::withMessages(['settings.rules' => 'Ajoutez au moins une règle avant activation.']);
        foreach ($v['settings']['rules'] as $i => $rule) {
            if ($rule['entityId'] && EntiteOrganisationnelle::find($rule['entityId'])?->type !== $rule['scopeType']) throw ValidationException::withMessages(["settings.rules.$i.entityId" => 'L’entité ne correspond pas au niveau choisi.']);
            $field = "settings.rules.$i.format";
            $need = ['compteur'];
            if ($rule['scopeType'] !== 'global' || $rule['entityId']) {
                if (!in_array($rule['scopeType'], $types, true)) throw ValidationException::withMessages(["settings.rules.$i.scopeType" => 'Type d’entité inconnu.']);
                if (!str_contains($rule['format'], '{code}') && !str_contains($rule['format'], '{chemin}')) throw ValidationException::withMessages([$field => 'Inclure {code} ou {chemin} pour distinguer les entités.']);
            }
            if ($rule['period'] !== 'continuous') $need[] = 'annee';
            if ($rule['period'] === 'month') $need[] = 'mois';
            if ($rule['splitType']) $need[] = 'type';
            if ($rule['splitSens']) $need[] = 'sens';
            foreach ($need as $token) if (!str_contains($rule['format'], '{'.$token.'}')) throw ValidationException::withMessages([$field => "Variable {{$token}} requise."]);
            $remaining = str_replace(array_map(fn ($t) => '{'.$t.'}', CourrierNumberingService::TOKENS), '', $rule['format']);
            if (str_contains($remaining, '{') || str_contains($remaining, '}')) throw ValidationException::withMessages([$field => 'Variable inconnue ou accolade invalide.']);
        }
        DB::transaction(function () use ($v, $r) {
            $state = DB::table('numbering_state')->where('id', 1)->lockForUpdate()->first();
            abort_unless((string) $state->version_id === (string) $v['version'], 409, 'Configuration modifiée entre-temps. Rechargez avant d’enregistrer.');
            $codes = array_filter(array_column($v['codes'], 'code'));
            if (count($codes) !== count(array_unique($codes))) throw ValidationException::withMessages(['codes' => 'Chaque code administratif doit être unique.']);
            if (DB::table('entites_organisationnelles')->whereNotIn('id', array_column($v['codes'], 'id'))->whereIn('code', $codes)->exists()) throw ValidationException::withMessages(['codes' => 'Code déjà utilisé par une autre entité.']);
            DB::table('entites_organisationnelles')->whereIn('id', array_column($v['codes'], 'id'))->update(['code' => null]);
            foreach ($v['codes'] as $c) DB::table('entites_organisationnelles')->where('id', $c['id'])->update(['code' => $c['code'] ?: null]);
            $id = DB::table('numbering_versions')->insertGetId(['settings' => json_encode($v['settings']), 'created_by' => $r->user()->id, 'created_at' => now()]);
            DB::table('numbering_state')->where('id', 1)->update(['version_id' => $id]);
        }, 3);
        return $this->show($r);
    }

    public function preview(Request $r)
    {
        $v = $r->validate(['entityId' => 'nullable|uuid', 'type' => 'required|in:INTERNE,EXTERNE', 'sens' => 'required|in:ENTRANT,SORTANT', 'count' => 'sometimes|integer|min:1|max:1000']);
        $config = $this->numbering->settings();
        if (!$config['settings']['enabled']) return response()->json(['data' => ['enabled' => false]]);
        $entity = isset($v['entityId']) ? $this->numbering->allowedEntities($r->user())->firstWhere('id', $v['entityId']) : null;
        abort_if(isset($v['entityId']) && !$entity, 403);
        [$rule, $scope] = $this->numbering->resolve($config['settings'], $entity, $v['type'], $v['sens']);
        if (!$rule) throw ValidationException::withMessages(['entityId' => 'Aucune règle applicable.']);
        $date = now($config['settings']['timezone']);
        $data = ['enabled' => true, 'rule' => $rule['name'],
            'example' => $this->numbering->render($config['settings'], $rule, $scope, $v['type'], $v['sens'], $date, $rule['start']),
            'reserved' => false];
        if (isset($v['count'])) {
            $data['numbers'] = $this->numbering->upcoming($config['settings'], $rule, $scope, $v['type'], $v['sens'], $date, $v['count']);
        }
        return response()->json(['data' => $data]);
    }
}
