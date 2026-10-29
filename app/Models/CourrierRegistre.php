<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class CourrierRegistre extends Model {
 protected $table='courrier_registre';protected $primaryKey='courrier_id';public $incrementing=false;protected $keyType='string';public $timestamps=false;
 protected $casts=['data'=>'array'];protected $fillable=['courrier_id','data','updated_at'];
}
