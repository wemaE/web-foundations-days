// Day 5 - Asynchronous User Directory

// API Endpoint
let USERS_API_URL = 'https://jsonplaceholder.typicode.com/users';

// Stored Users State
let storedUsers = [];

// DOM Elements
const loadUsersBtn = typeof document !== 'undefined' ? document.getElementById('load-users') : null;
const filterInput = typeof document !== 'undefined' ? document.getElementById('filter-input') : null;
const statusMessage = typeof document !== 'undefined' ? document.getElementById('status') : null;
const usersList = typeof document !== 'undefined' ? document.getElementById('users-list') : null;

// Async function to load users from API
async function loadUsers() {
  if (loadUsersBtn) {
    loadUsersBtn.disabled = true;
  }

  if (statusMessage) {
    statusMessage.textContent = 'Loading users...';
    statusMessage.className = 'status-message loading';
  }

  try {
    const response = await fetch(USERS_API_URL);

    // Verify response status
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    storedUsers = data;

    // Reset filter input if present
    if (filterInput) {
      filterInput.value = '';
    }

    renderUsers(storedUsers);

    if (statusMessage) {
      statusMessage.textContent = `Successfully loaded ${storedUsers.length} users.`;
      statusMessage.className = 'status-message success';
    }
  } catch (error) {
    console.error('Error fetching users:', error);
    if (statusMessage) {
      statusMessage.textContent = `Failed to load users: ${error.message}`;
      statusMessage.className = 'status-message error';
    }
    if (usersList) {
      usersList.innerHTML = '';
    }
  } finally {
    if (loadUsersBtn) {
      loadUsersBtn.disabled = false;
    }
  }
}

// Render user cards to the DOM using createElement and textContent
function renderUsers(list) {
  if (!usersList) return;

  usersList.innerHTML = '';

  // Show "No users match your filter." when appropriate
  if (list.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'no-match';
    emptyItem.textContent = 'No users match your filter.';
    usersList.appendChild(emptyItem);
    return;
  }

  list.forEach((user) => {
    const li = document.createElement('li');
    li.className = 'user-card';

    // Name
    const nameEl = document.createElement('h3');
    nameEl.className = 'user-name';
    nameEl.textContent = user.name || 'Unknown Name';

    // Email
    const emailEl = document.createElement('p');
    emailEl.className = 'user-email';
    emailEl.textContent = `Email: ${user.email || 'N/A'}`;

    // City (handles both nested JSONPlaceholder address.city and flat city)
    const city = (user.address && user.address.city) || user.city || 'N/A';
    const cityEl = document.createElement('p');
    cityEl.className = 'user-city';
    cityEl.textContent = `City: ${city}`;

    // Company (handles both nested JSONPlaceholder company.name and flat company)
    const company = (user.company && user.company.name) || user.company || 'N/A';
    const companyEl = document.createElement('p');
    companyEl.className = 'user-company';
    companyEl.textContent = `Company: ${company}`;

    // Append all elements to user card
    li.appendChild(nameEl);
    li.appendChild(emailEl);
    li.appendChild(cityEl);
    li.appendChild(companyEl);

    usersList.appendChild(li);
  });
}

// Filter stored users by name on input, case-insensitively, without refetching
if (filterInput) {
  filterInput.addEventListener('input', () => {
    const query = filterInput.value.trim().toLowerCase();
    const filtered = storedUsers.filter((user) =>
      user.name && user.name.toLowerCase().includes(query)
    );
    renderUsers(filtered);
  });
}

// Attach click listener to Load Users button
if (loadUsersBtn) {
  loadUsersBtn.addEventListener('click', () => {
    loadUsers();
  });
}

// Helpers for testing / programmatic configuration
function setUsersApiUrl(newUrl) {
  USERS_API_URL = newUrl;
}

function getStoredUsers() {
  return storedUsers;
}

function setStoredUsers(users) {
  storedUsers = users;
}

// Export for Node/testing environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadUsers,
    renderUsers,
    setUsersApiUrl,
    getStoredUsers,
    setStoredUsers
  };
}
