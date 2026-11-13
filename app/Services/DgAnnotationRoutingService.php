<?php
namespace App\Services;

use App\Models\{User,Courrier,Annotation,WorkflowEtape,EntiteOrganisationnelle};
use Illuminate\Validation\ValidationException;

class DgAnnotationRoutingService
{
    public function route(User $actor, Courrier $courrier, Annotation $annotation, array $target): void
    {
        abort_unless($actor->role === 'DIRECTEUR_GENERAL', 403);
        $entity = null;
        if ($target['type'] === 'ENTITE') {
            $entity = EntiteOrganisationnelle::whereKey($target['id'])->where('actif',true)->first();
            $person = $entity ? User::whereKey($entity->responsable_id)->where('actif',true)->first() : null;
            if ($person && $person->entite_id !== $entity->id) $person = null;
        } else {
            $person = User::whereKey($target['id'])->where('actif',true)->first();
            $entity = $person ? EntiteOrganisationnelle::whereKey($person->entite_id)->where('actif',true)->first() : null;
        }
        if (!$person || !$entity || in_array($person->role,['SUPER_ADMIN','DIRECTEUR_GENERAL'],true)) {
            throw ValidationException::withMessages(['workflowTarget'=>'Choisissez une unité avec un responsable actif ou un utilisateur actif rattaché à une unité.']);
        }
        $all = EntiteOrganisationnelle::where('actif',true)->get()->keyBy('id');
        $seen = []; $root = $entity;
        while ($root && $root->type !== 'direction_generale') {
            if (isset($seen[$root->id])) $root = null;
            else {$seen[$root->id]=true; $root=$all->get($root->parent_id);}
        }
        if (!$root || $root->responsable_id !== $actor->id) abort(403,'Destinataire hors de votre organigramme.');
        $steps=WorkflowEtape::where('courrier_id',$courrier->id)->lockForUpdate()->get();
        $source=$steps->firstWhere('id',$annotation->workflow_etape_id);
        if (!$source || $source->assigne_a !== $actor->id) abort(409,'L’annotation doit appartenir à votre étape active.');
        $existing=$steps->first(fn($s)=>($s->declencheur['dgSourceStepId']??null)===$source->id && $s->assigne_a===$person->id && $s->statut==='EN_ATTENTE' && !$s->date_debut);
        $evidence=['actorId'=>$actor->id,'targetId'=>$person->id,'annotationId'=>$annotation->id,'annotationText'=>$annotation->contenu,'fichierId'=>$annotation->fichier_id,'page'=>$annotation->page,'createdAt'=>now()->toIso8601String()];
        if ($existing) {
            $trigger=$existing->declencheur; $trigger['orientation']=$evidence; $existing->update(['declencheur'=>$trigger]);
            return;
        }
        // Insert after the DG's previous destinations and before the existing visa/closure.
        $tail=$steps->filter(fn($s)=>($s->declencheur['dgSourceStepId']??null)===$source->id)->sortBy('ordre')->last() ?? $source;
        $successors=$steps->filter(fn($s)=>($s->declencheur['etapePrecedenteId']??null)===$tail->id);
        foreach ($successors as $next) if ($next->statut!=='EN_ATTENTE' || $next->date_debut) abort(409,'La suite du circuit est déjà commencée.');
        foreach ($steps->where('ordre','>',$tail->ordre) as $later) $later->update(['ordre'=>$later->ordre+1]);
        $task=WorkflowEtape::create(['courrier_id'=>$courrier->id,'etape'=>'Traitement de l’instruction DG — '.$entity->nom,'assigne_a'=>$person->id,'statut'=>'EN_ATTENTE','cree_par'=>$actor->id,'ordre'=>$tail->ordre+1,'est_condition'=>false,'declencheur'=>['type'=>'APRES_ETAPE','etapePrecedenteId'=>$tail->id,'circuit'=>'ARMP','phase'=>'EXECUTION','dgSourceStepId'=>$source->id,'orientation'=>$evidence]]);
        foreach ($successors as $next) {$trigger=$next->declencheur; $trigger['etapePrecedenteId']=$task->id; $next->update(['declencheur'=>$trigger]);}
        $engine=app(WorkflowExecutionService::class);$engine->ensureAssignment($courrier,$task,$actor);
        $fresh=WorkflowEtape::where('courrier_id',$courrier->id)->get();$engine->validateGraph($fresh);$engine->synchronize($courrier,$fresh);$engine->notifyReady($courrier,$fresh);
    }
}
