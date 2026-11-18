<?php
namespace App\Services;

use App\Models\{Courrier, User};

/** Registration identities always come from the authenticated account. */
class CourrierRegistrationService
{
    private function assertType(User $actor, ?string $type): void
    {
        if ($type !== 'EXTERNE' || $actor->isSuperAdmin()) return;
        $central = $actor->isSecretaire() && app(CourrierAccessService::class)->secretaryRoot($actor)?->type === 'direction_generale';
        abort_unless($central, 403, 'La création des courriers externes est réservée au secrétariat de la Direction générale et à l’administrateur.');
    }

    public function input(User $actor, array $input): array
    {
        $this->assertType($actor, $input['type'] ?? null);
        $root = \App\Models\EntiteOrganisationnelle::where('actif', true)->find($actor->entite_id)
            ?? app(CourrierAccessService::class)->secretaryRoot($actor);
        abort_unless($root, 422, 'Rattachez le compte connecté à une entité avant l’enregistrement.');
        $input['expediteur'] = $root->nom;
        $input['enregistrePar'] = $actor->id;
        $extra = $input['extraFields'] ?? [];
        if (is_string($extra)) $extra = json_decode($extra, true) ?: [];
        if (!is_array($extra)) $extra = [];
        if (($input['type'] ?? null) === 'EXTERNE' && ($input['sens'] ?? 'ENTRANT') === 'ENTRANT') {
            $central = app(CourrierAccessService::class)->secretaryRoot($actor);
            if ($central?->type !== 'direction_generale') $central = \App\Models\EntiteOrganisationnelle::where('actif',true)->where('type','direction_generale')->where('nom','Direction Générale')->first();
            abort_unless($central,422,'Renseignez la Direction Générale dans l’organigramme avant l’enregistrement des courriers externes entrants.');
            $requested = trim((string)($input['destinataire'] ?? ''));
            if ($requested !== '' && $requested !== $central->nom) $extra['destinataireOrientationSouhaite'] = $requested;
            $input['destinataire'] = $central->nom;
            $cascade = [];foreach(app(CourrierPartyService::class)->path($central) as $entity) $cascade[$entity->type]=$entity->id;
            $extra['entiteDestinataireJson'] = json_encode($cascade,JSON_UNESCAPED_UNICODE);
            $extra['entiteDestinataireChemin'] = $central->nom;
        }
        if (($input['type'] ?? null) === 'INTERNE') {
            $path = app(CourrierPartyService::class)->path($root);
            if (collect($path)->contains('type','direction')) {
                $central = collect($path)->first(fn($entity) => $entity->type === 'direction_generale');
                abort_unless($central,422,'Renseignez la Direction Générale de rattachement avant l’enregistrement.');
                $input['destinataire'] = $central->nom;
                $recipientCascade=[];
                foreach(app(CourrierPartyService::class)->path($central) as $entity) $recipientCascade[$entity->type]=$entity->id;
                $extra['entiteDestinataireJson']=json_encode($recipientCascade,JSON_UNESCAPED_UNICODE);
                $extra['entiteDestinataireChemin']=$central->nom;
            }
            $cascade = [];
            foreach ($path as $entity) $cascade[$entity->type] = $entity->id;
            $extra['entiteEmetteurJson'] = json_encode($cascade, JSON_UNESCAPED_UNICODE);
            $extra['entiteEmetteurChemin'] = implode(' / ', array_map(fn($entity) => $entity->nom, $path));
        } else {
            unset($extra['entiteEmetteurJson'], $extra['entiteEmetteurChemin']);
        }
        // Keep required configured aliases aligned with the canonical API parties.
        $config = \App\Models\Config::getValue('formulaire', []);
        $sections = $config[$input['sens'] ?? 'ENTRANT'][$input['type'] ?? 'EXTERNE'] ?? [];
        foreach ($sections as $section) foreach ($section['columns'] ?? [] as $column) foreach ($column['fields'] ?? [] as $field) {
            $name = $field['name'] ?? '';
            $label = \Illuminate\Support\Str::ascii(mb_strtolower($name.' '.($field['label'] ?? '')));
            if ($name && preg_match('/expediteur|emetteur|sender/', $label)) $extra[$name] = $root->nom;
            elseif ($name && preg_match('/destinataire|recipient|recepteur/', $label)) $extra[$name] = $input['destinataire'] ?? '';
        }
        $input['extraFields'] = $extra;
        return $input;
    }

    public function prepare(User $actor, Courrier $courrier): void
    {
        if (!$courrier->exists || $courrier->isDirty('type')) $this->assertType($actor, $courrier->type);
        if ($courrier->exists) {
            // Editing a received record must not replace its original sender by the editor.
            $courrier->expediteur = $courrier->getRawOriginal('expediteur');
            $old = $courrier->getOriginal('extra_fields') ?? [];
            $extra = $courrier->extra_fields ?? [];
            foreach (['entiteEmetteurJson','entiteEmetteurChemin'] as $key) {
                unset($extra[$key]);
                if (array_key_exists($key, $old)) $extra[$key] = $old[$key];
            }
            $courrier->extra_fields = $extra;
            return;
        }
        $input = $this->input($actor, ['type'=>$courrier->type,'sens'=>$courrier->sens,'destinataire'=>$courrier->destinataire,'extraFields'=>$courrier->extra_fields]);
        $courrier->expediteur = $input['expediteur'];
        $courrier->destinataire = $input['destinataire'] ?? $courrier->destinataire;
        $courrier->enregistre_par = $actor->id;
        $courrier->extra_fields = $input['extraFields'];
    }
}
