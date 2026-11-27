// This file manages user authentication, including login and logout functionalities.

// Demo credentials (for testing when Supabase is not configured)
const DEMO_USERS = {
    'admin@drikapex.com': 'password123',
    'employee@drikapex.com': 'password123',
    'user@example.com': 'password123'
};

let supabaseClient = null;
let useDemo = false;

// Try to initialize Supabase client
try {
    if (typeof supabase !== 'undefined') {
        const supabaseUrl = 'YOUR_SUPABASE_URL';
        const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';
        
        // Check if Supabase is properly configured
        if (supabaseUrl && supabaseUrl !== 'YOUR_SUPABASE_URL' && supabaseKey && supabaseKey !== 'YOUR_SUPABASE_ANON_KEY') {
            supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
        } else {
            useDemo = true;
            console.log('Supabase not configured. Using demo mode.');
            console.log('Demo users:', Object.keys(DEMO_USERS).join(', '));
        }
    }
} catch (e) {
    useDemo = true;
    console.log('Supabase library not available. Using demo mode.');
}

// Login function
async function login(email, password) {
    try {
        if (useDemo || !supabaseClient) {
            // Demo mode authentication
            if (DEMO_USERS[email] && DEMO_USERS[email] === password) {
                console.log('Demo login successful:', email);
                localStorage.setItem('user_email', email);
                localStorage.setItem('logged_in', 'true');
                window.location.href = 'dashboard.html';
            } else {
                alert('Demo login failed: Invalid email or password\n\nTry:\nadmin@drikapex.com / password123');
                document.getElementById('error-message').textContent = 'Invalid email or password';
            }
        } else {
            // Real Supabase authentication
            const { user, session, error } = await supabaseClient.auth.signIn({
                email: email,
                password: password,
            });

            if (error) {
                console.error('Login error:', error.message);
                alert('Login failed: ' + error.message);
                document.getElementById('error-message').textContent = error.message;
            } else {
                console.log('Login successful:', user);
                window.location.href = 'dashboard.html';
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login error: ' + error.message);
        document.getElementById('error-message').textContent = error.message;
    }
}

// Logout function
async function logout() {
    try {
        if (useDemo || !supabaseClient) {
            // Demo mode logout
            localStorage.removeItem('user_email');
            localStorage.removeItem('logged_in');
            console.log('Demo logout successful');
            window.location.href = 'login.html';
        } else {
            // Real Supabase logout
            const { error } = await supabaseClient.auth.signOut();

            if (error) {
                console.error('Logout error:', error.message);
            } else {
                console.log('Logout successful');
                window.location.href = 'login.html';
            }
        }
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = 'login.html';
    }
}

// Check if user is logged in
function isLoggedIn() {
    if (useDemo) {
        return localStorage.getItem('logged_in') === 'true';
    }
    // For real Supabase, you would check the session
    return !!localStorage.getItem('logged_in');
}

// Get current user
function getCurrentUser() {
    if (useDemo) {
        return localStorage.getItem('user_email');
    }
    // For real Supabase implementation
    return localStorage.getItem('user_email');
}

// Redirect to login if not authenticated
function checkAuth() {
    if (!isLoggedIn() && !window.location.pathname.endsWith('/login.html')) {
        window.location.href = 'login.html';
    }
}

// Event listener for login form submission
if (document.getElementById('login-form')) {
    document.getElementById('login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        login(email, password);
    });
}