<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;use App\Models\User;use App\Services\{OrganisationProgressService,CourrierAccessService};use Illuminate\Http\Request;
class OrganisationProgressController extends Controller
{
 public function index(Request$request,OrganisationProgressService$progress,CourrierAccessService$access){$this->authorize('voir-courriers');$v=$request->validate(['userId'=>'nullable|uuid|exists:users,id','page'=>'nullable|integer|min:1']);return response()->json(['data'=>isset($v['userId'])?$progress->details($request->user(),User::findOrFail($v['userId']),$access,(int)($v['page']??1)):$progress->summary($request->user(),$access)]);}
}
