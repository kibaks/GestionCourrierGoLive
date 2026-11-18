<?php
namespace App\Services;

use App\Models\{Courrier, User};

/** Registration identities always come from the authenticated account. */
class CourrierRegistrationService
{
    public function input(User $actor, array $input): array
    {
        $input['expediteur'] = $actor->name;
        $input['enregistrePar'] = $actor->id;
        $extra = $input['extraFields'] ?? [];
        if (is_string($extra)) $extra = json_decode($extra, true) ?: [];
        if (!is_array($extra)) $extra = [];
        if (($input['type'] ?? null) === 'INTERNE') {
            $root = app(CourrierAccessService::class)->secretaryRoot($actor);
            abort_unless($root, 422, 'Rattachez le compte connecté à une entité interne avant l’enregistrement.');
            $path = app(CourrierPartyService::class)->path($root);
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
            if ($name && preg_match('/expediteur|emetteur|sender/', $label)) $extra[$name] = $actor->name;
            elseif ($name && preg_match('/destinataire|recipient|recepteur/', $label)) $extra[$name] = $input['destinataire'] ?? '';
        }
        $input['extraFields'] = $extra;
        return $input;
    }

    public function prepare(User $actor, Courrier $courrier): void
    {
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
        $input = $this->input($actor, ['type'=>$courrier->type,'extraFields'=>$courrier->extra_fields]);
        $courrier->expediteur = $input['expediteur'];
        $courrier->enregistre_par = $actor->id;
        $courrier->extra_fields = $input['extraFields'];
    }
}
