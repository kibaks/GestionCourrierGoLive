<?php
return [
    'default'=>env('QUEUE_CONNECTION','sync'),
    'connections'=>[
        'sync'=>['driver'=>'sync'],
        'database'=>['driver'=>'database','connection'=>env('DB_QUEUE_CONNECTION'),'table'=>'jobs','queue'=>'default','retry_after'=>120,'after_commit'=>true],
    ],
    'failed'=>['driver'=>null],
];
