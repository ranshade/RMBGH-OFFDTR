<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Employee;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(SuperAdminSeeder::class);
        $this->call(HrAccountSeeder::class);

        // DEMO ONLY. Remove or change this before any real deployment.
        Employee::firstOrCreate(
            ['employee_no' => 'DEMO-001'],
            [
                'full_name' => 'Demo Hospital Employee',
                'department' => 'Administration',
                'position' => 'Demo',
                'status' => 'active',
            ]
        );
    }
}
