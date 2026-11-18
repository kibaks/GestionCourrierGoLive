<?php
namespace App\Services;

use App\Models\{Courrier, User, EntiteOrganisationnelle};

/** Resolves the parties from the configured organisation, without guessing from ownership. */
class CourrierPartyService
{
    private $entities;
    public function __construct() { $this->entities = EntiteOrganisationnelle::where('actif', true)->get()->keyBy('id'); }

    public function path(?EntiteOrganisationnelle $entity): array
    {
        $path=[]; $seen=[];
        while ($entity) {
            if (isset($seen[$entity->id])) return [];
            $seen[$entity->id]=true; array_unshift($path,$entity); $entity=$this->entities->get($entity->parent_id);
        }
        return $path;
    }

    public function entity(Courrier $courrier, string $side): ?EntiteOrganisationnelle
    {
        $key=$side==='destinataire'?'entiteDestinataireJson':'entiteEmetteurJson';
        $raw=$courrier->extra_fields[$key]??null;
        $cascade=is_string($raw)?json_decode($raw,true):$raw;
        if ($raw!==null && (!is_array($cascade) || !$cascade)) return null;
        if (is_array($cascade) && $cascade) {
            $ids=array_values($cascade); $selected=$this->entities->whereIn('id',$ids);
            if ($selected->count()!==count(array_unique($ids))) return null;
            $leaf=$selected->filter(fn($e)=>!$selected->contains(fn($child)=>$child->parent_id===$e->id));
            if($leaf->count()!==1) return null;
            $entity=$leaf->first();
            return array_diff($ids,array_map(fn($e)=>$e->id,$this->path($entity)))?null:$entity;
        }
        $name=trim((string)$courrier->$side);
        $matches=$this->entities->filter(fn($e)=>$e->nom===$name||$e->id===$name||($e->getAttribute('code') && mb_strtolower($e->getAttribute('code'))===mb_strtolower($name)));
        if($matches->count()===1)return $matches->first();
        if (in_array(mb_strtoupper($name), ['DG','DG ARMP'], true)) {
            $dg=$this->entities->where('type','direction_generale')->where('nom','Direction Générale');
            if ($dg->count()===1) return $dg->first();
        }
        if (mb_strtoupper($name)==='DAF') {
            $daf=$this->entities->where('nom','Direction Administrative et Financière');
            if ($daf->count()===1) return $daf->first();
        }
        // Historical labels can identify a responsible person, but never use fuzzy names.
        $person=trim(preg_replace('/^(?:DG(?: ARMP)?|DAF)\s*[—–-]\s*/u','',$name));
        $users=User::where('actif',true)->where('name',$person)->get();
        if($users->count()===1)return $this->entities->get($users->first()->entite_id);
        return null;
    }

    public function assertDistinct(Courrier $courrier): void
    {
        if ($courrier->type === 'EXTERNE' && $courrier->sens === 'ENTRANT') {
            $recipient = $this->entity($courrier, 'destinataire');
            if (!$recipient || $recipient->type !== 'direction_generale') {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'destinataire' => 'Un courrier externe entrant doit être adressé à la Direction générale avant sa transmission à une direction interne.',
                ]);
            }
        }
        if ($courrier->type !== 'INTERNE') return;
        $sender = $this->entity($courrier, 'expediteur');
        $recipient = $this->entity($courrier, 'destinataire');
        $sameLabel = trim((string)$courrier->expediteur) !== ''
            && mb_strtolower(trim((string)$courrier->expediteur)) === mb_strtolower(trim((string)$courrier->destinataire));
        if (($sender && $recipient && $sender->id === $recipient->id) || $sameLabel) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'destinataire' => 'Une entité interne ne peut pas être à la fois expéditrice et destinataire du même courrier.',
            ]);
        }
        if ($sender && $recipient && $sender->type !== 'direction_generale' && $recipient->type !== 'direction_generale') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'destinataire' => 'Les courriers internes circulent uniquement entre la Direction générale et une autre entité. Les échanges directs entre deux autres entités sont interdits.',
            ]);
        }
    }

    public function sense(Courrier $courrier, ?User $viewer): ?string
    {
        if($courrier->type!=='INTERNE'||!$viewer||$viewer->isSuperAdmin())return $courrier->sens;
        $unit=$this->entities->get($viewer->entite_id);
        if(!$unit && $viewer->direction) {
            $matches=$this->entities->where('nom',$viewer->direction);
            if($matches->count()===1)$unit=$matches->first();
        }
        if(!$unit)return $courrier->sens;
        $sender=$this->entity($courrier,'expediteur');$recipient=$this->entity($courrier,'destinataire');
        $contains=function($party)use($unit){
            if(!$party)return false;
            // DG is a distinct correspondent, not every descendant's mailbox.
            if($unit->type==='direction_generale')return $party->id===$unit->id;
            return in_array($unit->id,array_map(fn($e)=>$e->id,$this->path($party)),true)
                || ($party->type !== 'direction_generale' && in_array($party->id,array_map(fn($e)=>$e->id,$this->path($unit)),true));
        };
        $emits=$contains($sender);$receives=$contains($recipient);
        return $emits!==$receives?($receives?'ENTRANT':'SORTANT'):$courrier->sens;
    }
}
