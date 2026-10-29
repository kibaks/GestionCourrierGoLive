<?php
namespace App\Http\Middleware;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
class AuditRequests {
    public function handle(Request $request,Closure $next) {
        try { $response=$next($request); }
        catch (\Throwable $e) { report($e); $response=app(\Illuminate\Contracts\Debug\ExceptionHandler::class)->render($request,$e); }
        if (!in_array($request->method(),['POST','PUT','PATCH','DELETE'],true)) return $response;
        try {
            $resource=null;
            foreach(($request->route()?->parameters()??[]) as $value) if(is_string($value)&&Str::isUuid($value)){$resource=$value;break;}
            DB::table('audit_events')->insert(['user_id'=>$request->user()?->id,'method'=>$request->method(),'route'=>$request->route()?->uri()??'unknown','resource_id'=>$resource,'status'=>$response->getStatusCode(),'network_hash'=>hash_hmac('sha256',$request->ip()??'',config('app.key')),'created_at'=>now()]);
        } catch (\Throwable $e) { report($e); }
        return $response;
    }
}
