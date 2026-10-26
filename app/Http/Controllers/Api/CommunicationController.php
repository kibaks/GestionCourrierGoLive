<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CommunicationSettings;
use Illuminate\Http\Request;

class CommunicationController extends Controller
{
    public function system()
    {
        abort_unless(auth()->user()->isSuperAdmin(),403);
        $path='/workspace/gestion-courrier/operations-health.json';
        if (!is_file($path)) return response()->json(['message'=>'Le premier contrôle de maintenance n’a pas encore été exécuté.'],503);
        return response()->json(['data'=>json_decode(file_get_contents($path),true)]);
    }
    public function audit()
    {
        abort_unless(auth()->user()->isSuperAdmin(),403);
        return response()->json(['data'=>\Illuminate\Support\Facades\DB::table('audit_events as a')->leftJoin('users as u','u.id','=','a.user_id')->orderByDesc('a.id')->limit(100)->get(['a.id','a.method','a.route','a.resource_id','a.status','a.created_at','u.name'])]);
    }
    public function deliveries()
    {
        abort_unless(auth()->user()->isSuperAdmin(), 403);
        $rows=\Illuminate\Support\Facades\DB::table('communication_deliveries as d')->leftJoin('notifications as n','n.id','=','d.notification_id')->orderByDesc('d.created_at')->limit(50)->get(['d.id','d.channel','d.status','d.error','d.created_at','n.title']);
        return response()->json(['data'=>$rows]);
    }
    public function show()
    {
        abort_unless(auth()->user()->isSuperAdmin(), 403);
        return response()->json(['data' => CommunicationSettings::publicValue(CommunicationSettings::get())]);
    }

    public function update(Request $request)
    {
        abort_unless(auth()->user()->isSuperAdmin(), 403);
        return response()->json(['data' => CommunicationSettings::save($request->all())]);
    }
}
