// This file handles document management, including uploading and retrieving documents.

const { createClient } = supabase;

// Initialize Supabase client
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to upload a document
async function uploadDocument(file) {
    const { data, error } = await supabase.storage.from('documents').upload(file.name, file);
    if (error) {
        console.error('Error uploading document:', error);
        return null;
    }
    return data.Key;
}

// Function to retrieve documents
async function fetchDocuments() {
    const { data, error } = await supabase
        .from('documents')
        .select('*');
    if (error) {
        console.error('Error fetching documents:', error);
        return [];
    }
    return data;
}

// Function to delete a document
async function deleteDocument(documentId) {
    const { data, error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);
    if (error) {
        console.error('Error deleting document:', error);
        return false;
    }
    return true;
}

// Function to display documents on the page
async function displayDocuments() {
    const documents = await fetchDocuments();
    const documentsList = document.getElementById('documents-list');
    documentsList.innerHTML = '';

    documents.forEach(doc => {
        const listItem = document.createElement('li');
        listItem.textContent = doc.title;
        documentsList.appendChild(listItem);
    });
}

// Event listener for document upload
document.getElementById('upload-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    if (file) {
        const documentKey = await uploadDocument(file);
        if (documentKey) {
            alert('Document uploaded successfully!');
            displayDocuments();
        }
    }
});

// Initial call to display documents
displayDocuments();