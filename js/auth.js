// This file manages user authentication, including login and logout functionalities.

const { createClient } = supabase;

// Initialize Supabase client
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Login function
async function login(email, password) {
    const { user, session, error } = await supabase.auth.signIn({
        email: email,
        password: password,
    });

    if (error) {
        console.error('Login error:', error.message);
        alert('Login failed: ' + error.message);
    } else {
        console.log('Login successful:', user);
        window.location.href = 'dashboard.html'; // Redirect to dashboard
    }
}

// Logout function
async function logout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
        console.error('Logout error:', error.message);
    } else {
        console.log('Logout successful');
        window.location.href = 'login.html'; // Redirect to login
    }
}

// Event listener for login form submission
document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    login(email, password);
});