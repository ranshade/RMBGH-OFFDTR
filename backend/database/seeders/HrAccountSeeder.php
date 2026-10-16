<?php

namespace Database\Seeders;

use App\Models\Employee;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class HrAccountSeeder extends Seeder
{
    public function run(): void
    {
        $passcode = (string) config('admin.hr_passcode');

        if (!preg_match('/^\d{3}$/', $passcode)) {
            throw new RuntimeException('Set HR_PASSCODE (exactly 3 digits) in .env before seeding.');
        }

        Employee::firstOrCreate(
            ['employee_no' => config('admin.hr_employee_no')],
            [
                'full_name' => 'HR',
                'position' => 'HR',
                'status' => 'active',
                'password' => Hash::make($passcode),
            ]
        );
    }
}
