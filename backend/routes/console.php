<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('attendance:about', function () {
    $this->info('Offline Hospital Attendance starter');
})->purpose('Display offline attendance application information');
