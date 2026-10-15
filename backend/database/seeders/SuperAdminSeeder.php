<?php

namespace Database\Seeders;

use App\Models\Employee;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        $passcode = (string) config('admin.superadmin_passcode');

        if (!preg_match('/^\d{3}$/', $passcode)) {
            throw new RuntimeException('Set SUPERADMIN_PASSCODE (exactly 3 digits) in .env before seeding.');
        }

        Employee::firstOrCreate(
            ['employee_no' => config('admin.superadmin_employee_no')],
            [
                'full_name' => 'Super Admin',
                'position' => 'Super Admin',
                'status' => 'active',
                'password' => Hash::make($passcode),
            ]
        );
    }
}
