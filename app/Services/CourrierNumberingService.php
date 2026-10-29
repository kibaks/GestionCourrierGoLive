<?php

namespace App\Services;

use App\Models\Courrier;
use App\Models\EntiteOrganisationnelle;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CourrierNumberingService
{
    public const DEFAULTS = ['enabled' => false, 'organisation' => 'ORG', 'timezone' => 'Africa/Kinshasa', 'rules' => []];
    public const TOKENS = ['organisation', 'code', 'chemin', 'annee', 'mois', 'type', 'sens', 'compteur'];

    public function settings(): array
    {
        $state = DB::table('numbering_state')->where('id', 1)->first();
        $version = $state?->version_id ? DB::table('numbering_versions')->find($state->version_id) : null;
        return ['version' => $state?->version_id, 'settings' => $version ? json_decode($version->settings, true) : self::DEFAULTS];
    }

    public function allowedEntities(User $user)
    {
        $all = EntiteOrganisationnelle::where('actif', true)->orderBy('ordre')->orderBy('nom')->get();
        if (in_array($user->role, ['SUPER_ADMIN', 'DIRECTEUR_GENERAL'], true)) return $all;
        $root = $user->entite_id ?: $all->first(fn ($e) => $e->type === 'direction' && $e->nom === $user->direction)?->id;
        if (!$root) return collect();
        $ids = [$root];
        do {
            $before = count($ids);
            foreach ($all as $entity) if (in_array($entity->parent_id, $ids, true) && !in_array($entity->id, $ids, true)) $ids[] = $entity->id;
        } while (count($ids) > $before);
        return $all->whereIn('id', $ids)->values();
    }

    public function assign(Courrier $courrier): void
    {
        // Every insert is wrapped by Courrier::performInsert. Lock order is fixed:
        // configuration -> system counter -> organisation counter -> issue ledger.
        DB::table('numbering_state')->where('id', 1)->lockForUpdate()->first();
        $systemYear = now('Africa/Kinshasa')->year;
        $prefix = $courrier->type === 'INTERNE' ? 'INT' : 'EXT';
        $systemKey = hash('sha256', "system:$prefix:$systemYear");
        if (!DB::table('numbering_counters')->where('key', $systemKey)->exists()) {
            $max = 0;
            foreach (DB::table('numbering_issues')->where('kind', 'system')->where('number', 'like', "$prefix-$systemYear-%")->pluck('number') as $n) {
                if (preg_match('/-(\d+)$/', $n, $m)) $max = max($max, (int) $m[1]);
            }
            DB::table('numbering_counters')->insert(['key' => $systemKey, 'value' => $max]);
        }
        $seq = $this->next($systemKey, 1);
        $courrier->numero = sprintf('%s-%d-%04d', $prefix, $systemYear, $seq);
        $this->issue('system', $courrier->numero, $courrier, ['counter' => $systemKey]);

        $config = $this->settings();
        if (!$config['settings']['enabled']) {
            $courrier->entite_numerotation_id = null;
            return;
        }
        $entity = $courrier->entite_numerotation_id ? EntiteOrganisationnelle::find($courrier->entite_numerotation_id) : null;
        if ($courrier->entite_numerotation_id && (!$entity || !$entity->actif || (Auth::user() && !$this->allowedEntities(Auth::user())->contains('id', $entity->id)))) {
            $this->invalid('entiteNumerotationId', 'Entité de numérotation non autorisée.');
        }
        [$rule, $scope] = $this->resolve($config['settings'], $entity, $courrier->type, $courrier->sens);
        if (!$rule) $this->invalid('entiteNumerotationId', 'Aucune règle applicable. Choisissez une entité ou contactez l’administrateur.');
        $date = now($config['settings']['timezone']);
        [$counter, $period] = $this->counterIdentity($rule, $scope, $courrier->type, $courrier->sens, $date);
        $number = $this->render($config['settings'], $rule, $scope, $courrier->type, $courrier->sens, $date, $this->next($counter, $rule['start']));
        if (DB::table('numbering_issues')->where('kind', 'organisation')->where('number', $number)->exists()) {
            $this->invalid('numerotation', 'Format ambigu : ce numéro a déjà été attribué. Ajoutez le code d’entité, la période, le type ou le sens au format selon le périmètre du compteur.');
        }
        $snapshot = ['version' => $config['version'], 'ruleId' => $rule['id'], 'ruleName' => $rule['name'], 'entityId' => $scope?->id,
            'code' => $scope?->code, 'path' => $scope ? (str_contains($rule['format'], '{chemin}') ? $this->path($scope) : $scope->code) : null, 'period' => $period, 'format' => $rule['format']];
        $courrier->numero_organisationnel = $number;
        $courrier->numerotation_snapshot = $snapshot;
        $this->issue('organisation', $number, $courrier, $snapshot);
    }

    public function resolve(array $settings, ?EntiteOrganisationnelle $entity, string $type, ?string $sens): array
    {
        $rules = array_values(array_filter($settings['rules'], fn ($r) => ($r['type'] === '*' || $r['type'] === $type) && ($r['sens'] === '*' || $r['sens'] === ($sens ?? 'ENTRANT'))));
        $visited = [];
        for ($node = $entity; $node; $node = $node->parent) {
            if (isset($visited[$node->id])) $this->invalid('entiteNumerotationId', 'Cycle détecté dans l’organigramme.');
            $visited[$node->id] = true;
            foreach ($rules as $rule) {
                if (($rule['entityId'] && $rule['entityId'] === $node->id) || (!$rule['entityId'] && $rule['scopeType'] === $node->type)) return [$rule, $node];
            }
        }
        foreach ($rules as $rule) if (!$rule['entityId'] && $rule['scopeType'] === 'global') return [$rule, null];
        return [null, null];
    }

    public function render(array $settings, array $rule, ?EntiteOrganisationnelle $entity, string $type, ?string $sens, $date, int $sequence): string
    {
        if ($entity && !$entity->code) $this->invalid('entiteNumerotationId', 'Le code administratif de cette entité doit être renseigné dans les paramètres.');
        $path = str_contains($rule['format'], '{chemin}') && $entity ? $this->path($entity) : ($entity?->code ?? 'CENTRAL');
        $values = ['organisation' => $settings['organisation'], 'code' => $entity?->code ?? 'CENTRAL', 'chemin' => $path,
            'annee' => $date->format('Y'), 'mois' => $date->format('m'), 'type' => $type === 'INTERNE' ? 'INT' : 'EXT',
            'sens' => ($sens ?? 'ENTRANT') === 'SORTANT' ? 'SORT' : 'ENT', 'compteur' => str_pad((string) $sequence, $rule['width'], '0', STR_PAD_LEFT)];
        $number = strtr($rule['format'], array_combine(array_map(fn ($k) => '{'.$k.'}', array_keys($values)), array_values($values)));
        if (mb_strlen($number) > 191) $this->invalid('numerotation', 'Le numéro généré dépasse 191 caractères.');
        return $number;
    }

    /** Read upcoming references without creating counters or reserving numbers. */
    public function upcoming(array $settings, array $rule, ?EntiteOrganisationnelle $scope, string $type, string $sens, $date, int $count): array
    {
        [$key] = $this->counterIdentity($rule, $scope, $type, $sens, $date);
        $current = DB::table('numbering_counters')->where('key', $key)->value('value');
        $start = max($current === null ? $rule['start'] : (int) $current + 1, $rule['start']);
        $numbers = [];
        for ($offset = 0; $offset < $count; $offset++) {
            $numbers[] = $this->render($settings, $rule, $scope, $type, $sens, $date, $start + $offset);
        }
        if (DB::table('numbering_issues')->where('kind', 'organisation')->whereIn('number', $numbers)->exists()) {
            $this->invalid('numerotation', 'Le format du registre produit une référence déjà attribuée. Vérifiez les paramètres administrateur.');
        }
        return $numbers;
    }

    private function counterIdentity(array $rule, ?EntiteOrganisationnelle $scope, string $type, ?string $sens, $date): array
    {
        $period = match ($rule['period']) { 'year' => $date->format('Y'), 'month' => $date->format('Ym'), default => 'continuous' };
        $key = hash('sha256', json_encode([$rule['id'], $scope?->id ?? 'global', $period,
            $rule['splitType'] ? $type : '*', $rule['splitSens'] ? ($sens ?? 'ENTRANT') : '*']));
        return [$key, $period];
    }

    private function path(EntiteOrganisationnelle $entity): string
    {
        $codes = []; $seen = [];
        for ($e = $entity; $e; $e = $e->parent) {
            if (isset($seen[$e->id])) $this->invalid('numerotation', 'Cycle dans l’organigramme.');
            if (!$e->code) $this->invalid('numerotation', 'Chaque entité du chemin doit posséder un code administratif.');
            $seen[$e->id] = true; array_unshift($codes, $e->code);
        }
        return implode('/', $codes);
    }

    private function next(string $key, int $start): int
    {
        DB::table('numbering_counters')->insertOrIgnore(['key' => $key, 'value' => $start - 1]);
        $row = DB::table('numbering_counters')->where('key', $key)->lockForUpdate()->first();
        $value = max((int) $row->value + 1, $start);
        DB::table('numbering_counters')->where('key', $key)->update(['value' => $value]);
        return $value;
    }

    private function issue(string $kind, string $number, Courrier $courrier, array $snapshot): void
    {
        DB::table('numbering_issues')->insert(['kind' => $kind, 'number' => $number, 'courrier_id' => $courrier->id,
            'actor_id' => Auth::id(), 'snapshot' => json_encode($snapshot), 'created_at' => now()]);
    }

    private function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
