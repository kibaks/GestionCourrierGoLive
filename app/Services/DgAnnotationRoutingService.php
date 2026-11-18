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
        if ($courrier->type === 'INTERNE') {
            $parties=app(CourrierPartyService::class);
            $sender=$parties->entity($courrier,'expediteur');
            $recipient=$parties->entity($courrier,'destinataire');
            if ($sender?->type==='direction_generale' && $recipient && $recipient->type!=='direction_generale') {
                $recipientPath=array_map(fn($item)=>$item->id,$parties->path($recipient));
                $targetPath=array_map(fn($item)=>$item->id,$parties->path($entity));
                abort_unless($entity->type!=='direction_generale' && (in_array($entity->id,$recipientPath,true) || in_array($recipient->id,$targetPath,true)),422,'La transmission doit suivre l’entité destinataire du courrier.');
            }
        }
        $chain=[$person];
        $direction=app(CourrierAccessService::class)->secretaryRoot($person);
        if ($direction && $direction->type==='direction') {
            $secretary=User::where('role','SECRETAIRE')->where('actif',true)->get()->first(fn($u)=>app(CourrierAccessService::class)->secretaryRoot($u)?->id===$direction->id);
            $director=User::whereKey($direction->responsable_id)->where('actif',true)->first();
            if (!$secretary || !$director) throw ValidationException::withMessages(['workflowTarget'=>'La direction destinataire doit avoir un secrétariat et un directeur actifs.']);
            $chain=collect([$secretary,$director,$person])->unique('id')->values()->all();
        }
        $steps=WorkflowEtape::where('courrier_id',$courrier->id)->lockForUpdate()->get();
        $source=$steps->firstWhere('id',$annotation->workflow_etape_id);
        if (!$source || $source->assigne_a !== $actor->id) abort(409,'L’annotation doit appartenir à votre étape active.');
        $existing=$steps->first(fn($s)=>($s->declencheur['dgSourceStepId']??null)===$source->id && $s->assigne_a===$person->id && $s->statut==='EN_ATTENTE' && !$s->date_debut);
        $evidence=['actorId'=>$actor->id,'targetId'=>$person->id,'annotationId'=>$annotation->id,'annotationText'=>$annotation->contenu,'fichierId'=>$annotation->fichier_id,'page'=>$annotation->page,'createdAt'=>now()->toIso8601String()];
        if ($existing) {
            $trigger=$existing->declencheur; $trigger['orientation']=$evidence; $existing->update(['declencheur'=>$trigger]);
            return;
        }
        // Reuse the pending hierarchy all the way to the selected recipient.
        // A bureau may already have director, division and bureau tasks in this circuit.
        $plannedPath=collect();$cursor=$source;$seen=[];
        $plannedEntityIds=array_map(fn($item)=>$item->id,app(CourrierPartyService::class)->path($entity));
        while ($cursor && !isset($seen[$cursor->id])) {
            $seen[$cursor->id]=true;
            $children=$steps->filter(fn($step)=>($step->declencheur['etapePrecedenteId']??null)===$cursor->id);
            if ($children->count()!==1) break;
            $next=$children->first();$responsible=User::find($next->assigne_a);
            if ($next->statut!=='EN_ATTENTE' || $next->date_debut
                || !in_array($next->declencheur['phase']??null,['INSTRUCTION','EXECUTION','RECEPTION_SECRETARIAT'],true)
                || !$responsible || !in_array($responsible->entite_id,$plannedEntityIds,true)) break;
            $plannedPath->push($next);
            if ($next->assigne_a===$person->id) break;
            $cursor=$next;
        }
        if ($plannedPath->isNotEmpty() && $plannedPath->last()->assigne_a===$person->id) {
            $engine=app(WorkflowExecutionService::class);$previous=$source;
            if ($direction?->type==='direction' && $plannedPath->first()->assigne_a!==$chain[0]->id) {
                foreach ($steps->where('ordre','>',$source->ordre) as $later) $later->update(['ordre'=>$later->ordre+1]);
                $reception=WorkflowEtape::create(['courrier_id'=>$courrier->id,'etape'=>'Réception et orientation du secrétariat — '.$direction->nom,'assigne_a'=>$chain[0]->id,'statut'=>'EN_ATTENTE','cree_par'=>$actor->id,'ordre'=>$source->ordre+1,'est_condition'=>false,'declencheur'=>['type'=>'APRES_ETAPE','etapePrecedenteId'=>$source->id,'circuit'=>'ARMP','phase'=>'RECEPTION_SECRETARIAT','dgSourceStepId'=>$source->id,'finalRecipientId'=>$person->id,'targetEntityId'=>$direction->id,'orientation'=>$evidence]]);
                $engine->ensureAssignment($courrier,$reception,$actor);$previous=$reception;
            }
            foreach ($plannedPath as $planned) {
                $link=$planned->declencheur;$link['etapePrecedenteId']=$previous->id;$link['dgSourceStepId']=$source->id;$link['finalRecipientId']=$person->id;$link['orientation']=$evidence;
                $planned->update(['declencheur'=>$link]);$engine->ensureAssignment($courrier,$planned,$actor);$previous=$planned;
            }
            $fresh=WorkflowEtape::where('courrier_id',$courrier->id)->get();$engine->validateGraph($fresh);$engine->synchronize($courrier,$fresh);$engine->notifyReady($courrier,$fresh);
            return;
        }
        // Insert after the DG's previous destinations and before the existing visa/closure.
        $tail=$steps->filter(fn($s)=>($s->declencheur['dgSourceStepId']??null)===$source->id)->sortBy('ordre')->last() ?? $source;
        $successors=$steps->filter(fn($s)=>($s->declencheur['etapePrecedenteId']??null)===$tail->id);
        foreach ($successors as $next) if ($next->statut!=='EN_ATTENTE' || $next->date_debut) abort(409,'La suite du circuit est déjà commencée.');
        foreach ($steps->where('ordre','>',$tail->ordre) as $later) $later->update(['ordre'=>$later->ordre+count($chain)]);
        $engine=app(WorkflowExecutionService::class);$previous=$tail;$ordinal=$tail->ordre;
        foreach ($chain as $recipient) {
            $isSecretary=$recipient->role==='SECRETAIRE';
            $task=WorkflowEtape::create(['courrier_id'=>$courrier->id,'etape'=>($isSecretary?'Réception et orientation du secrétariat — ':'Traitement de l’instruction DG — ').($isSecretary?$direction->nom:$entity->nom),'assigne_a'=>$recipient->id,'statut'=>'EN_ATTENTE','cree_par'=>$actor->id,'ordre'=>++$ordinal,'est_condition'=>false,'declencheur'=>['type'=>'APRES_ETAPE','etapePrecedenteId'=>$previous->id,'circuit'=>'ARMP','phase'=>$isSecretary?'RECEPTION_SECRETARIAT':'EXECUTION','dgSourceStepId'=>$source->id,'finalRecipientId'=>$person->id,'targetEntityId'=>$direction?->id,'orientation'=>$evidence]]);
            $engine->ensureAssignment($courrier,$task,$actor);$previous=$task;
        }
        foreach ($successors as $next) {$trigger=$next->declencheur; $trigger['etapePrecedenteId']=$previous->id; $next->update(['declencheur'=>$trigger]);}
        $fresh=WorkflowEtape::where('courrier_id',$courrier->id)->get();$engine->validateGraph($fresh);$engine->synchronize($courrier,$fresh);$engine->notifyReady($courrier,$fresh);
    }
}
