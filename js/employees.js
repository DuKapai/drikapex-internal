// This file contains functions to manage employee data, such as fetching and updating employee records.

const { createClient } = supabase;

// Initialize Supabase client
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Fetch all employees
async function fetchEmployees() {
    const { data, error } = await supabase
        .from('employees')
        .select('*');

    if (error) {
        console.error('Error fetching employees:', error);
        return [];
    }
    return data;
}

// Fetch a single employee by ID
async function fetchEmployeeById(employeeId) {
    const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', employeeId)
        .single();

    if (error) {
        console.error('Error fetching employee:', error);
        return null;
    }
    return data;
}

// Update employee details
async function updateEmployee(employeeId, updatedData) {
    const { data, error } = await supabase
        .from('employees')
        .update(updatedData)
        .eq('id', employeeId);

    if (error) {
        console.error('Error updating employee:', error);
        return null;
    }
    return data;
}

// Add a new employee
async function addEmployee(employeeData) {
    const { data, error } = await supabase
        .from('employees')
        .insert([employeeData]);

    if (error) {
        console.error('Error adding employee:', error);
        return null;
    }
    return data;
}

// Delete an employee
async function deleteEmployee(employeeId) {
    const { data, error } = await supabase
        .from('employees')
        .delete()
        .eq('id', employeeId);

    if (error) {
        console.error('Error deleting employee:', error);
        return null;
    }
    return data;
}