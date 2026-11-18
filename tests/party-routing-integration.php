<?php
// --existing-db runs all fixtures inside one transaction and rolls it back.
$retainOrientationFixtures=true;
require __DIR__.'/orientation-integration.php';
$c->type='INTERNE';$c->statut='ENREGISTRE';$c->expediteur=$unit->id;$c->destinataire=$dgUnit->id;
$parties=new App\Services\CourrierPartyService();
check($parties->sense($c,$secretary)==='SORTANT','sender direction sees outgoing');
check($parties->sense($c,$secDG)==='ENTRANT','DG recipient sees incoming');
$c->expediteur=$dgUnit->id;$c->destinataire=$unit->id;
check($parties->sense($c,$secretary)==='ENTRANT','recipient direction sees incoming');
check($parties->sense($c,$secDG)==='SORTANT','DG sender sees outgoing');
$c->destinataire='Unknown unit';
check($parties->entity($c,'destinataire')===null,'unknown party never guessed from direction');
check($service->targets($secDG,$c)->isEmpty(),'unknown recipient blocks orientation');
$c->destinataire=$unit->id;
$unrouted=\App\Models\Courrier::withoutEvents(fn()=>\App\Models\Courrier::create(['type'=>'INTERNE','sens'=>'SORTANT','statut'=>'ENREGISTRE','expediteur'=>$dgUnit->id,'destinataire'=>$unit->id,'enregistre_par'=>$secDG->id,'direction'=>$unit->nom,'priorite'=>'NORMALE','date_reception'=>now(),'date_enregistrement'=>now(),'objet'=>'Circuit selon destinataire','numero'=>uniqid('PARTY-')]));
check($service->targets($secDG,$unrouted)->pluck('id')->all()===[$dg->id],'DG secretary obtains DG validation before destination dispatch');
$unrouted->expediteur=$unit->id;$unrouted->destinataire=$dgUnit->id;$unrouted->save();
check($service->targets($secretary,$unrouted)->pluck('id')->all()===[$director->id],'outgoing direction retains its director validation before DG');
$self=new \App\Models\Courrier(['type'=>'INTERNE','expediteur'=>$unit->id,'destinataire'=>$unit->id]);
try{$parties->assertDistinct($self);throw new RuntimeException('Self-route accepted');}catch(Illuminate\Validation\ValidationException){check(true,'self-correspondence rejected');}
$self->destinataire=$other->id;
try{$parties->assertDistinct($self);throw new RuntimeException('Direct route accepted');}catch(Illuminate\Validation\ValidationException){check(true,'direct correspondence between non-DG entities rejected');}
$self->destinataire=$dgUnit->id;$parties->assertDistinct($self);check(true,'entity to DG accepted');
$self->expediteur=$dgUnit->id;$self->destinataire=$unit->id;$parties->assertDistinct($self);check(true,'DG to entity accepted');
$self->type='EXTERNE';$self->sens='ENTRANT';
try{$parties->assertDistinct($self);throw new RuntimeException('External direct route accepted');}catch(Illuminate\Validation\ValidationException){check(true,'external incoming direct to a direction rejected');}
$self->destinataire=$dgUnit->id;$parties->assertDistinct($self);check(true,'external incoming addressed to DG accepted');
if ($existing) \Illuminate\Support\Facades\DB::rollBack();
echo "PARTY ROUTING TESTS PASSED\n";
