// This file manages notifications, including fetching and displaying them to the user.

const supabaseUrl = 'https://your-supabase-url.supabase.co';
const supabaseKey = 'your-supabase-key';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Function to fetch notifications from the database
async function fetchNotifications() {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching notifications:', error);
        return [];
    }
    return data;
}

// Function to display notifications on the page
async function displayNotifications() {
    const notifications = await fetchNotifications();
    const notificationsContainer = document.getElementById('notifications-container');

    notificationsContainer.innerHTML = ''; // Clear existing notifications

    notifications.forEach(notification => {
        const notificationElement = document.createElement('div');
        notificationElement.classList.add('notification');
        notificationElement.innerHTML = `
            <h4>${notification.title}</h4>
            <p>${notification.content}</p>
            <small>${new Date(notification.created_at).toLocaleString()}</small>
        `;
        notificationsContainer.appendChild(notificationElement);
    });
}

// Call displayNotifications when the page loads
document.addEventListener('DOMContentLoaded', displayNotifications);