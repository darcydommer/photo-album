document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const photoUploadInput = document.getElementById('photo-upload');
    const photoGrid = document.getElementById('photo-grid');
    const photoTemplate = document.getElementById('photo-template');
    
    // IndexedDB setup
    let db;
    const DB_NAME = 'photoAlbumDB';
    const STORE_NAME = 'photos';
    const DB_VERSION = 1;
    
    // Initialize IndexedDB
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        alert('Error opening database. Your photos will not be saved between sessions.');
    };
    
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object store for photos
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };
    
    request.onsuccess = (event) => {
        db = event.target.result;
        console.log('Database opened successfully');
        
        // Load existing photos from database
        loadPhotosFromDB();
    };
    
    // Event Listeners
    photoUploadInput.addEventListener('change', handlePhotoUpload);
    photoGrid.addEventListener('click', handlePhotoRemove);
    
    /**
     * Handle photo upload when files are selected
     */
    function handlePhotoUpload(event) {
        const files = event.target.files;
        
        if (!files || files.length === 0) {
            return;
        }
        
        Array.from(files).forEach(file => {
            // Check if the file is an image
            if (!file.type.startsWith('image/')) {
                alert(`File "${file.name}" is not an image.`);
                return;
            }
            
            // Read the file and create a photo card
            const reader = new FileReader();
            
            reader.onload = (e) => {
                addPhotoToGrid(e.target.result, file);
            };
            
            reader.onerror = () => {
                alert(`Error reading file "${file.name}".`);
            };
            
            reader.readAsDataURL(file);
        });
        
        // Reset the input to allow selecting the same file again
        event.target.value = '';
    }
    
    /**
     * Load photos from IndexedDB
     */
    function loadPhotosFromDB() {
        if (!db) return;
        
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = (event) => {
            const photos = event.target.result;
            
            if (photos && photos.length > 0) {
                photos.forEach(photo => {
                    addPhotoToGridFromDB(photo);
                });
            }
        };
        
        request.onerror = (event) => {
            console.error('Error loading photos from database:', event.target.error);
        };
    }
    
    /**
     * Add a photo to the grid from database data
     */
    function addPhotoToGridFromDB(photoData) {
        // Clone the template
        const photoCard = document.importNode(photoTemplate.content, true).querySelector('.photo-card');
        
        // Set the unique ID
        photoCard.dataset.id = photoData.id;
        
        // Set the image source
        const img = photoCard.querySelector('.photo-img');
        img.src = photoData.imgSrc;
        img.alt = photoData.name;
        
        // Set metadata
        photoCard.querySelector('.name-value').textContent = photoData.name;
        photoCard.querySelector('.size-value').textContent = photoData.size;
        photoCard.querySelector('.type-value').textContent = photoData.type;
        photoCard.querySelector('.date-value').textContent = photoData.date;
        
        // Add double-click event listener to the image
        img.addEventListener('dblclick', handlePhotoDoubleClick);
        
        // Add to grid
        photoGrid.appendChild(photoCard);
    }
    
    /**
     * Add a photo to the grid with its metadata
     */
    function addPhotoToGrid(imgSrc, file) {
        // Generate a unique ID
        const id = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        // Format date
        const dateStr = formatDate(new Date());
        
        // Clone the template
        const photoCard = document.importNode(photoTemplate.content, true).querySelector('.photo-card');
        
        // Set the unique ID
        photoCard.dataset.id = id;
        
        // Set the image source
        const img = photoCard.querySelector('.photo-img');
        img.src = imgSrc;
        img.alt = file.name;
        
        // Set metadata
        photoCard.querySelector('.name-value').textContent = file.name;
        photoCard.querySelector('.size-value').textContent = formatFileSize(file.size);
        photoCard.querySelector('.type-value').textContent = file.type;
        photoCard.querySelector('.date-value').textContent = dateStr;
        
        // Add double-click event listener to the image
        img.addEventListener('dblclick', handlePhotoDoubleClick);
        
        // Add to grid
        photoGrid.appendChild(photoCard);
        
        // Save to IndexedDB
        savePhotoToDB({
            id: id,
            imgSrc: imgSrc,
            name: file.name,
            size: formatFileSize(file.size),
            type: file.type,
            date: dateStr
        });
    }
    
    /**
     * Save photo data to IndexedDB
     */
    function savePhotoToDB(photoData) {
        if (!db) return;
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.add(photoData);
        
        request.onerror = (event) => {
            console.error('Error saving photo to database:', event.target.error);
        };
    }
    
    /**
     * Delete photo from IndexedDB
     */
    function deletePhotoFromDB(id) {
        if (!db) return;
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.delete(id);
        
        request.onerror = (event) => {
            console.error('Error deleting photo from database:', event.target.error);
        };
    }
    
    /**
     * Handle photo double-click to open detail view
     */
    function handlePhotoDoubleClick(event) {
        const photoCard = event.target.closest('.photo-card');
        if (photoCard) {
            const photoId = photoCard.dataset.id;
            if (photoId) {
                // Open detail view in new tab
                window.open(`photo-detail.html?id=${photoId}`, '_blank');
            }
        }
    }
    
    /**
     * Handle photo removal when the remove button is clicked
     */
    function handlePhotoRemove(event) {
        if (event.target.classList.contains('remove-btn')) {
            const photoCard = event.target.closest('.photo-card');
            
            if (photoCard) {
                // Get the photo ID
                const photoId = photoCard.dataset.id;
                
                // Add a fade-out animation
                photoCard.style.opacity = '0';
                photoCard.style.transform = 'scale(0.8)';
                photoCard.style.transition = 'opacity 0.3s, transform 0.3s';
                
                // Remove after animation completes
                setTimeout(() => {
                    photoGrid.removeChild(photoCard);
                    
                    // Delete from IndexedDB
                    if (photoId) {
                        deletePhotoFromDB(photoId);
                    }
                }, 300);
            }
        }
    }
    
    /**
     * Format file size to a readable string (KB, MB)
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * Format date to a readable string
     */
    function formatDate(date) {
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    /**
     * Add drag and drop functionality
     */
    const dropArea = document.body;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropArea.classList.add('highlight');
    }
    
    function unhighlight() {
        dropArea.classList.remove('highlight');
    }
    
    dropArea.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            photoUploadInput.files = files;
            handlePhotoUpload({ target: photoUploadInput });
        }
    }
    
    // Add CSS for drag and drop highlight
    const style = document.createElement('style');
    style.textContent = `
        body.highlight::after {
            content: 'Drop images here';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(52, 152, 219, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 2rem;
            color: white;
            z-index: 1000;
        }
    `;
    document.head.appendChild(style);
});