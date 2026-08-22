const { createClient } = supabase;

const SUPABASE_URL = 'https://your-supabase-url.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getUser() {
    const { user, error } = await supabase.auth.getUser();
    if (error) {
        console.error('Error fetching user:', error);
    }
    return user;
}

async function signIn(email, password) {
    const { user, session, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    if (error) {
        console.error('Error signing in:', error);
    }
    return { user, session };
}

async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Error signing out:', error);
    }
}

async function fetchEmployees() {
    const { data, error } = await supabase.from('employees').select('*');
    if (error) {
        console.error('Error fetching employees:', error);
    }
    return data;
}

async function addEmployee(employee) {
    const { data, error } = await supabase.from('employees').insert([employee]);
    if (error) {
        console.error('Error adding employee:', error);
    }
    return data;
}

async function updateEmployee(id, updates) {
    const { data, error } = await supabase.from('employees').update(updates).eq('id', id);
    if (error) {
        console.error('Error updating employee:', error);
    }
    return data;
}

async function deleteEmployee(id) {
    const { data, error } = await supabase.from('employees').delete().eq('id', id);
    if (error) {
        console.error('Error deleting employee:', error);
    }
    return data;
}

export { getUser, signIn, signOut, fetchEmployees, addEmployee, updateEmployee, deleteEmployee };