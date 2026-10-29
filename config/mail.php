<?php
return [
    'default' => env('MAIL_MAILER', 'log'),
    'mailers' => [
        'smtp' => ['transport' => 'smtp', 'host' => env('MAIL_HOST'), 'port' => 465, 'encryption' => 'ssl', 'timeout' => 15],
        'log' => ['transport' => 'log'],
        'array' => ['transport' => 'array'],
    ],
    'from' => ['address' => 'info@armp-rdc.cd', 'name' => 'ARMP RDC'],
];
