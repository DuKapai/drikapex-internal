// This file contains functions for managing user accounts and roles.

const { createClient } = supabase;

// Initialize Supabase client
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to fetch all users
async function fetchUsers() {
    const { data, error } = await supabase
        .from('users')
        .select('*');

    if (error) {
        console.error('Error fetching users:', error);
        return [];
    }
    return data;
}

// Function to create a new user
async function createUser(username, employeeId) {
    const { data, error } = await supabase
        .from('users')
        .insert([{ username, employee_id: employeeId }]);

    if (error) {
        console.error('Error creating user:', error);
        return null;
    }
    return data;
}

// Function to update user details
async function updateUser(userId, updates) {
    const { data, error } = await supabase
        .from('users')
        .update(updates)
        .match({ id: userId });

    if (error) {
        console.error('Error updating user:', error);
        return null;
    }
    return data;
}

// Function to delete a user
async function deleteUser(userId) {
    const { data, error } = await supabase
        .from('users')
        .delete()
        .match({ id: userId });

    if (error) {
        console.error('Error deleting user:', error);
        return null;
    }
    return data;
}

// Export functions for use in other modules
export { fetchUsers, createUser, updateUser, deleteUser };