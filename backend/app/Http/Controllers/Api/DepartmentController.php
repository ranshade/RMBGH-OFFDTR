<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\Department;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
class DepartmentController extends Controller {
 public function index(){ return response()->json(Department::orderBy('name')->get()); }
 public function store(Request $request){ $data=$request->validate(['name'=>['required','string','max:120','unique:departments,name'],'code'=>['nullable','string','max:30']]); return response()->json(Department::create($data),201); }
 public function update(Request $request, Department $department){ $data=$request->validate(['name'=>['sometimes','required','string','max:120',Rule::unique('departments','name')->ignore($department->id)],'code'=>['nullable','string','max:30']]); $old=$department->name; $department->update($data); if(isset($data['name']) && $old!==$data['name']) DB::table('employees')->where('department',$old)->update(['department'=>$data['name']]); return response()->json($department->fresh()); }
 public function destroy(Department $department){ if(DB::table('employees')->where('department',$department->name)->exists()) return response()->json(['message'=>'This department is assigned to one or more employees. Reassign them before deleting.'],409); $department->delete(); return response()->json(['ok'=>true]); }
}
