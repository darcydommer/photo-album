document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const photoUploadInput = document.getElementById('photo-upload');
    const photoGrid = document.getElementById('photo-grid');
    const photoTemplate = document.getElementById('photo-template');
    const metadataFieldTemplate = document.getElementById('metadata-field-template');
    const manageMetadataBtn = document.getElementById('manage-metadata-btn');
    const metadataModal = document.getElementById('metadata-modal');
    const closeModalBtn = document.querySelector('.close-modal');
    const metadataFieldsList = document.getElementById('metadata-fields-list');
    const newMetadataLabelInput = document.getElementById('new-metadata-label');
    const addMetadataFieldBtn = document.getElementById('add-metadata-field-btn');
    
    // IndexedDB setup
    let db;
    let dbReady = false;
    const DB_NAME = 'photoAlbumDB_v2'; // Changed database name to avoid conflicts with previous versions
    const PHOTOS_STORE = 'photos';
    const METADATA_STORE = 'metadataFields';
    const DB_VERSION = 1; // Reset version to 1 since we're using a new database name
    
    // Fallback storage for critical data
    const LOCAL_STORAGE_PHOTO_IDS_KEY = 'photoAlbum_photoIds';
    const LOCAL_STORAGE_METADATA_KEY = 'photoAlbum_metadata';
    
    // Queue for operations that need to be performed once the database is ready
    const dbOperationsQueue = [];
    
    // Initialize IndexedDB
    function initDatabase() {
        console.log('Initializing database...');
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            alert('Error opening database. Your photos will not be saved between sessions.');
            
            // Try to recover by deleting the database and trying again
            if (event.target.error.name === 'VersionError') {
                console.log('Version error, attempting to delete and recreate database');
                indexedDB.deleteDatabase(DB_NAME).onsuccess = () => {
                    console.log('Database deleted, reinitializing');
                    setTimeout(initDatabase, 500); // Retry after a short delay
                };
            }
        };
        
        request.onblocked = (event) => {
            console.warn('Database opening blocked, please close other tabs with this app');
            alert('Database opening blocked. Please close any other tabs with this application and refresh the page.');
        };
        
        request.onupgradeneeded = (event) => {
            console.log('Database upgrade needed, creating object stores...');
            const db = event.target.result;
            
            // Create object store for photos if it doesn't exist
            if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
                console.log('Creating photos store');
                db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' });
            }
            
            // Create object store for metadata fields if it doesn't exist
            if (!db.objectStoreNames.contains(METADATA_STORE)) {
                console.log('Creating metadata fields store');
                db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
            }
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            dbReady = true;
            console.log('Database opened successfully');
            
            // Handle database version changes
            db.onversionchange = (event) => {
                db.close();
                dbReady = false;
                alert('Database is outdated, please reload the page.');
            };
            
            // Process any queued operations
            while (dbOperationsQueue.length > 0) {
                const operation = dbOperationsQueue.shift();
                operation();
            }
            
            // Load existing photos from database
            loadPhotosFromDB();
            
            // Load existing metadata fields
            loadMetadataFields();
            
            // Verify database is working by performing a test write/read
            verifyDatabaseFunctionality();
        };
    }
    
    // Start database initialization
    initDatabase();
    
    /**
     * Verify database functionality by performing a test write/read
     */
    function verifyDatabaseFunctionality() {
        if (!db) return;
        
        const testId = 'test-' + Date.now();
        const testData = { id: testId, test: true, timestamp: Date.now() };
        
        try {
            const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
            const store = transaction.objectStore(PHOTOS_STORE);
            
            // Add test data
            const addRequest = store.add(testData);
            
            addRequest.onsuccess = () => {
                console.log('Test write successful');
                
                // Read test data
                const getRequest = store.get(testId);
                
                getRequest.onsuccess = () => {
                    if (getRequest.result && getRequest.result.id === testId) {
                        console.log('Test read successful, database is functioning correctly');
                        
                        // Clean up test data
                        store.delete(testId);
                    } else {
                        console.error('Test read failed, database may not be functioning correctly');
                    }
                };
                
                getRequest.onerror = (event) => {
                    console.error('Test read failed:', event.target.error);
                };
            };
            
            addRequest.onerror = (event) => {
                console.error('Test write failed:', event.target.error);
            };
        } catch (error) {
            console.error('Database verification failed:', error);
        }
    }
    
    /**
     * Execute a database operation, queuing it if the database isn't ready yet
     */
    function executeDbOperation(operation) {
        if (dbReady && db) {
            operation();
        } else {
            console.log('Database not ready, queuing operation');
            dbOperationsQueue.push(operation);
            
            // If database isn't ready after a reasonable time, try reinitializing
            if (!dbReady) {
                setTimeout(() => {
                    if (!dbReady) {
                        console.log('Database still not ready, attempting to reinitialize');
                        initDatabase();
                    }
                }, 3000);
            }
        }
    }
    
    // Event Listeners
    photoUploadInput.addEventListener('change', handlePhotoUpload);
    photoGrid.addEventListener('click', handlePhotoGridClick);
    manageMetadataBtn.addEventListener('click', openMetadataModal);
    closeModalBtn.addEventListener('click', closeMetadataModal);
    addMetadataFieldBtn.addEventListener('click', addMetadataField);
    metadataFieldsList.addEventListener('click', handleMetadataFieldsListClick);
    
    // Close modal when clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target === metadataModal) {
            closeMetadataModal();
        }
    });
    
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
     * Open the metadata management modal
     */
    function openMetadataModal() {
        metadataModal.style.display = 'block';
    }
    
    /**
     * Close the metadata management modal
     */
    function closeMetadataModal() {
        metadataModal.style.display = 'none';
    }
    
    /**
     * Load metadata fields from IndexedDB with localStorage fallback
     */
    function loadMetadataFields() {
        executeDbOperation(() => {
            console.log('Loading metadata fields from database...');
            
            try {
                const transaction = db.transaction([METADATA_STORE], 'readonly');
                const store = transaction.objectStore(METADATA_STORE);
                const request = store.getAll();
                
                request.onsuccess = (event) => {
                    const fields = event.target.result;
                    
                    // Clear the current list
                    metadataFieldsList.innerHTML = '';
                    
                    if (fields && fields.length > 0) {
                        // Save to localStorage as backup
                        try {
                            localStorage.setItem(LOCAL_STORAGE_METADATA_KEY, JSON.stringify(fields));
                        } catch (e) {
                            console.error('Error saving metadata to localStorage:', e);
                        }
                        
                        fields.forEach(field => {
                            addMetadataFieldToList(field);
                        });
                    } else {
                        // Try to recover from localStorage
                        recoverMetadataFromLocalStorage();
                    }
                };
                
                request.onerror = (event) => {
                    console.error('Error loading metadata fields from database:', event.target.error);
                    // Try to recover from localStorage
                    recoverMetadataFromLocalStorage();
                };
            } catch (error) {
                console.error('Error in loadMetadataFields:', error);
                // Try to recover from localStorage
                recoverMetadataFromLocalStorage();
            }
        });
    }
    
    /**
     * Try to recover metadata fields from localStorage
     */
    function recoverMetadataFromLocalStorage() {
        try {
            const metadataStr = localStorage.getItem(LOCAL_STORAGE_METADATA_KEY);
            if (metadataStr) {
                const fields = JSON.parse(metadataStr);
                console.log(`Recovered ${fields.length} metadata fields from localStorage`);
                
                if (fields && fields.length > 0) {
                    fields.forEach(field => {
                        addMetadataFieldToList(field);
                        
                        // Save back to IndexedDB if available
                        if (db && dbReady) {
                            saveMetadataFieldToDB(field);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error recovering metadata from localStorage:', error);
        }
    }
    
    /**
     * Add a metadata field to the list in the modal
     */
    function addMetadataFieldToList(field) {
        const fieldItem = document.importNode(metadataFieldTemplate.content, true).querySelector('.metadata-field-item');
        fieldItem.dataset.id = field.id;
        fieldItem.querySelector('.metadata-label').textContent = field.label;
        
        metadataFieldsList.appendChild(fieldItem);
    }
    
    /**
     * Add a new metadata field
     */
    function addMetadataField() {
        const label = newMetadataLabelInput.value.trim();
        
        if (!label) {
            alert('Please enter a label for the metadata field.');
            return;
        }
        
        // Generate a unique ID
        const id = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        const field = {
            id: id,
            label: label
        };
        
        // Save to IndexedDB
        saveMetadataFieldToDB(field);
        
        // Add to the list
        addMetadataFieldToList(field);
        
        // Clear the input
        newMetadataLabelInput.value = '';
        
        // Update all existing photos to include this field
        updateAllPhotosWithNewField(field);
        
        // Backup to localStorage
        backupMetadataToLocalStorage();
    }
    
    /**
     * Backup all metadata fields to localStorage
     */
    function backupMetadataToLocalStorage() {
        if (!db) return;
        
        try {
            const transaction = db.transaction([METADATA_STORE], 'readonly');
            const store = transaction.objectStore(METADATA_STORE);
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                const fields = event.target.result;
                
                if (fields && fields.length > 0) {
                    try {
                        localStorage.setItem(LOCAL_STORAGE_METADATA_KEY, JSON.stringify(fields));
                        console.log('Metadata fields backed up to localStorage');
                    } catch (e) {
                        console.error('Error backing up metadata to localStorage:', e);
                    }
                }
            };
        } catch (error) {
            console.error('Error in backupMetadataToLocalStorage:', error);
        }
    }
    
    /**
     * Save metadata field to IndexedDB
     */
    function saveMetadataFieldToDB(field) {
        executeDbOperation(() => {
            console.log('Saving metadata field to database:', field.id);
            
            try {
                const transaction = db.transaction([METADATA_STORE], 'readwrite');
                const store = transaction.objectStore(METADATA_STORE);
                
                const request = store.add(field);
                
                request.onsuccess = () => {
                    console.log('Metadata field saved successfully:', field.id);
                    backupMetadataToLocalStorage();
                };
                
                request.onerror = (event) => {
                    console.error('Error saving metadata field to database:', event.target.error);
                    
                    // If the error is due to the object already existing, try updating instead
                    if (event.target.error.name === 'ConstraintError') {
                        console.log('Metadata field already exists, updating instead');
                        const updateRequest = store.put(field);
                        updateRequest.onerror = (e) => {
                            console.error('Error updating metadata field:', e.target.error);
                        };
                    }
                };
            } catch (error) {
                console.error('Error in saveMetadataFieldToDB:', error);
            }
        });
    }
    
    /**
     * Delete metadata field from IndexedDB
     */
    function deleteMetadataFieldFromDB(id) {
        executeDbOperation(() => {
            console.log('Deleting metadata field from database:', id);
            
            try {
                const transaction = db.transaction([METADATA_STORE], 'readwrite');
                const store = transaction.objectStore(METADATA_STORE);
                
                const request = store.delete(id);
                
                request.onsuccess = () => {
                    console.log('Metadata field deleted successfully:', id);
                    backupMetadataToLocalStorage();
                };
                
                request.onerror = (event) => {
                    console.error('Error deleting metadata field from database:', event.target.error);
                };
            } catch (error) {
                console.error('Error in deleteMetadataFieldFromDB:', error);
            }
        });
    }
    
    /**
     * Handle clicks on the metadata fields list
     */
    function handleMetadataFieldsListClick(event) {
        if (event.target.classList.contains('remove-metadata-field-btn')) {
            const fieldItem = event.target.closest('.metadata-field-item');
            
            if (fieldItem) {
                const fieldId = fieldItem.dataset.id;
                
                // Remove from the list
                metadataFieldsList.removeChild(fieldItem);
                
                // Delete from IndexedDB
                deleteMetadataFieldFromDB(fieldId);
                
                // Remove this field from all photos
                removeFieldFromAllPhotos(fieldId);
            }
        }
    }
    
    /**
     * Update all photos to include a new metadata field
     */
    function updateAllPhotosWithNewField(field) {
        executeDbOperation(() => {
            console.log('Updating all photos with new field:', field.id);
            
            try {
                const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
                const store = transaction.objectStore(PHOTOS_STORE);
                const request = store.getAll();
                
                request.onsuccess = (event) => {
                    const photos = event.target.result;
                    
                    if (photos && photos.length > 0) {
                        photos.forEach(photo => {
                            // Initialize customMetadata if it doesn't exist
                            if (!photo.customMetadata) {
                                photo.customMetadata = {};
                            }
                            
                            // Add the new field with an empty value if it doesn't exist
                            if (!(field.id in photo.customMetadata)) {
                                photo.customMetadata[field.id] = '';
                                
                                // Update the photo in the database
                                updatePhotoInDB(photo);
                            }
                        });
                        
                        // Refresh the photo grid to show the new fields
                        refreshPhotoGrid();
                    }
                };
                
                request.onerror = (event) => {
                    console.error('Error updating photos with new field:', event.target.error);
                };
            } catch (error) {
                console.error('Error in updateAllPhotosWithNewField:', error);
            }
        });
    }
    
    /**
     * Remove a field from all photos
     */
    function removeFieldFromAllPhotos(fieldId) {
        executeDbOperation(() => {
            console.log('Removing field from all photos:', fieldId);
            
            try {
                const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
                const store = transaction.objectStore(PHOTOS_STORE);
                const request = store.getAll();
                
                request.onsuccess = (event) => {
                    const photos = event.target.result;
                    
                    if (photos && photos.length > 0) {
                        photos.forEach(photo => {
                            // Remove the field if it exists
                            if (photo.customMetadata && fieldId in photo.customMetadata) {
                                delete photo.customMetadata[fieldId];
                                
                                // Update the photo in the database
                                updatePhotoInDB(photo);
                            }
                        });
                        
                        // Refresh the photo grid to remove the deleted fields
                        refreshPhotoGrid();
                    }
                };
                
                request.onerror = (event) => {
                    console.error('Error removing field from photos:', event.target.error);
                };
            } catch (error) {
                console.error('Error in removeFieldFromAllPhotos:', error);
            }
        });
    }
    
    /**
     * Refresh the photo grid
     */
    function refreshPhotoGrid() {
        // Clear the grid
        photoGrid.innerHTML = '';
        
        // Reload photos from database
        loadPhotosFromDB();
    }
    
    /**
     * Load photos from IndexedDB with fallback to localStorage IDs
     */
    function loadPhotosFromDB() {
        executeDbOperation(() => {
            console.log('Loading photos from database...');
            
            try {
                const transaction = db.transaction([PHOTOS_STORE], 'readonly');
                const store = transaction.objectStore(PHOTOS_STORE);
                const request = store.getAll();
                
                request.onsuccess = (event) => {
                    const photos = event.target.result;
                    console.log(`Found ${photos ? photos.length : 0} photos in database`);
                    
                    if (photos && photos.length > 0) {
                        photos.forEach(photo => {
                            addPhotoToGridFromDB(photo);
                        });
                        
                        // Update localStorage backup with all photo IDs
                        const photoIds = photos.map(photo => photo.id);
                        try {
                            localStorage.setItem(LOCAL_STORAGE_PHOTO_IDS_KEY, JSON.stringify(photoIds));
                            console.log('Photo IDs backed up to localStorage:', photoIds);
                        } catch (e) {
                            console.error('Error backing up photo IDs to localStorage:', e);
                        }
                    } else {
                        // Try to recover from localStorage backup
                        recoverPhotosFromLocalStorage();
                    }
                };
                
                request.onerror = (event) => {
                    console.error('Error loading photos from database:', event.target.error);
                    // Try to recover from localStorage backup
                    recoverPhotosFromLocalStorage();
                };
                
                // Add transaction complete handler
                transaction.oncomplete = () => {
                    console.log('Photo loading transaction completed');
                };
                
                transaction.onerror = (event) => {
                    console.error('Photo loading transaction error:', event.target.error);
                    // Try to recover from localStorage backup
                    recoverPhotosFromLocalStorage();
                };
            } catch (error) {
                console.error('Error in loadPhotosFromDB:', error);
                // Try to recover from localStorage backup
                recoverPhotosFromLocalStorage();
            }
        });
    }
    
    /**
     * Try to recover photos using IDs stored in localStorage
     */
    function recoverPhotosFromLocalStorage() {
        try {
            const photoIdsStr = localStorage.getItem(LOCAL_STORAGE_PHOTO_IDS_KEY);
            if (photoIdsStr) {
                const photoIds = JSON.parse(photoIdsStr);
                console.log(`Attempting to recover ${photoIds.length} photos from localStorage IDs`);
                
                if (photoIds.length > 0 && db && dbReady) {
                    photoIds.forEach(photoId => {
                        const transaction = db.transaction([PHOTOS_STORE], 'readonly');
                        const store = transaction.objectStore(PHOTOS_STORE);
                        const request = store.get(photoId);
                        
                        request.onsuccess = (event) => {
                            const photo = event.target.result;
                            if (photo) {
                                console.log('Recovered photo from ID:', photoId);
                                addPhotoToGridFromDB(photo);
                            } else {
                                console.log('Could not recover photo with ID:', photoId);
                            }
                        };
                    });
                }
            }
        } catch (error) {
            console.error('Error recovering photos from localStorage:', error);
        }
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
        
        // Set basic metadata
        photoCard.querySelector('.name-value').textContent = photoData.name;
        photoCard.querySelector('.size-value').textContent = photoData.size;
        photoCard.querySelector('.type-value').textContent = photoData.type;
        photoCard.querySelector('.date-value').textContent = photoData.date;
        
        // Add custom metadata if it exists and db is available
        const customMetadataContainer = photoCard.querySelector('.custom-metadata');
        
        if (photoData.customMetadata) {
            try {
                executeDbOperation(() => {
                    // Get all metadata fields
                    const transaction = db.transaction([METADATA_STORE], 'readonly');
                    const store = transaction.objectStore(METADATA_STORE);
                    const request = store.getAll();
                    
                    request.onsuccess = (event) => {
                        const fields = event.target.result;
                        
                        if (fields && fields.length > 0) {
                            fields.forEach(field => {
                                const fieldId = field.id;
                                const fieldLabel = field.label;
                                const fieldValue = photoData.customMetadata[fieldId] || '';
                                
                                // Create metadata field element
                                const metadataField = document.createElement('p');
                                metadataField.dataset.fieldId = fieldId;
                                
                                // Create label element
                                const labelElement = document.createElement('strong');
                                labelElement.textContent = fieldLabel + ': ';
                                
                                // Create value element
                                const valueElement = document.createElement('span');
                                valueElement.className = 'metadata-value';
                                valueElement.textContent = fieldValue;
                                
                                // Create edit button
                                const editButton = document.createElement('button');
                                editButton.className = 'edit-btn';
                                editButton.textContent = 'Edit';
                                
                                // Append elements to the field
                                metadataField.appendChild(labelElement);
                                metadataField.appendChild(valueElement);
                                metadataField.appendChild(editButton);
                                
                                // Add to the container
                                customMetadataContainer.appendChild(metadataField);
                            });
                        }
                    };
                    
                    request.onerror = (event) => {
                        console.error('Error loading metadata fields:', event.target.error);
                    };
                });
            } catch (error) {
                console.error('Error processing metadata fields:', error);
                // Still display the photo even if metadata can't be loaded
            }
        }
        
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
        
        // Create the photo object with empty custom metadata
        const photoData = {
            id: id,
            imgSrc: imgSrc,
            name: file.name,
            size: formatFileSize(file.size),
            type: file.type,
            date: dateStr,
            customMetadata: {}
        };
        
        // First add to grid to ensure the photo is displayed
        addPhotoToGridFromDB(photoData);
        
        // Then save to IndexedDB
        savePhotoToDB(photoData);
        
        // If database is available, get metadata fields and update the photo
        executeDbOperation(() => {
            try {
                const transaction = db.transaction([METADATA_STORE], 'readonly');
                const store = transaction.objectStore(METADATA_STORE);
                const request = store.getAll();
                
                request.onsuccess = (event) => {
                    const fields = event.target.result;
                    
                    if (fields && fields.length > 0) {
                        // Initialize custom metadata with empty values for all fields
                        const customMetadata = {};
                        
                        fields.forEach(field => {
                            customMetadata[field.id] = '';
                        });
                        
                        // Update the photo with the custom metadata
                        photoData.customMetadata = customMetadata;
                        
                        // Update in IndexedDB
                        updatePhotoInDB(photoData);
                    }
                };
            } catch (error) {
                console.error('Error processing metadata fields:', error);
                // Photo is already saved, so we can continue
            }
        });
    }
    
    /**
     * Save photo data to IndexedDB and update localStorage backup
     */
    function savePhotoToDB(photoData) {
        executeDbOperation(() => {
            console.log('Saving photo to database:', photoData.id);
            
            try {
                const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
                const store = transaction.objectStore(PHOTOS_STORE);
                
                const request = store.add(photoData);
                
                request.onsuccess = () => {
                    console.log('Photo saved successfully:', photoData.id);
                    
                    // Update localStorage backup of photo IDs
                    updatePhotoIdsInLocalStorage(photoData.id, 'add');
                    
                    // Verify the photo was actually saved
                    verifyPhotoSaved(photoData.id);
                };
                
                request.onerror = (event) => {
                    console.error('Error saving photo to database:', event.target.error);
                    
                    // If the error is due to the object already existing, try updating instead
                    if (event.target.error.name === 'ConstraintError') {
                        console.log('Photo already exists, updating instead');
                        updatePhotoInDB(photoData);
                    } else {
                        // For other errors, try again with a delay
                        setTimeout(() => {
                            console.log('Retrying photo save after error');
                            savePhotoToDB(photoData);
                        }, 1000);
                    }
                };
                
                // Add transaction complete handler
                transaction.oncomplete = () => {
                    console.log('Photo save transaction completed');
                };
                
                transaction.onerror = (event) => {
                    console.error('Photo save transaction error:', event.target.error);
                };
            } catch (error) {
                console.error('Error in savePhotoToDB:', error);
                
                // Try again after a delay
                setTimeout(() => {
                    console.log('Retrying photo save after exception');
                    savePhotoToDB(photoData);
                }, 1000);
            }
        });
    }
    
    /**
     * Verify that a photo was actually saved to the database
     */
    function verifyPhotoSaved(photoId) {
        executeDbOperation(() => {
            try {
                const transaction = db.transaction([PHOTOS_STORE], 'readonly');
                const store = transaction.objectStore(PHOTOS_STORE);
                const request = store.get(photoId);
                
                request.onsuccess = (event) => {
                    const photo = event.target.result;
                    if (photo) {
                        console.log('Photo verification successful:', photoId);
                    } else {
                        console.error('Photo verification failed - photo not found:', photoId);
                        // Try to save again
                        const photoCard = document.querySelector(`.photo-card[data-id="${photoId}"]`);
                        if (photoCard) {
                            const img = photoCard.querySelector('.photo-img');
                            if (img && img.src) {
                                console.log('Attempting to recover photo data from DOM');
                                // Recreate photo data from DOM
                                const photoData = {
                                    id: photoId,
                                    imgSrc: img.src,
                                    name: photoCard.querySelector('.name-value').textContent,
                                    size: photoCard.querySelector('.size-value').textContent,
                                    type: photoCard.querySelector('.type-value').textContent,
                                    date: photoCard.querySelector('.date-value').textContent,
                                    customMetadata: {}
                                };
                                
                                // Try to save again
                                savePhotoToDB(photoData);
                            }
                        }
                    }
                };
                
                request.onerror = (event) => {
                    console.error('Photo verification error:', event.target.error);
                };
            } catch (error) {
                console.error('Error in verifyPhotoSaved:', error);
            }
        });
    }
    
    /**
     * Update the list of photo IDs in localStorage as a backup
     */
    function updatePhotoIdsInLocalStorage(photoId, action) {
        try {
            // Get current photo IDs from localStorage
            let photoIds = [];
            const photoIdsStr = localStorage.getItem(LOCAL_STORAGE_PHOTO_IDS_KEY);
            if (photoIdsStr) {
                photoIds = JSON.parse(photoIdsStr);
            }
            
            if (action === 'add' && !photoIds.includes(photoId)) {
                // Add the photo ID if it doesn't exist
                photoIds.push(photoId);
            } else if (action === 'remove') {
                // Remove the photo ID
                photoIds = photoIds.filter(id => id !== photoId);
            }
            
            // Save back to localStorage
            localStorage.setItem(LOCAL_STORAGE_PHOTO_IDS_KEY, JSON.stringify(photoIds));
            console.log('Updated photo IDs in localStorage:', photoIds);
        } catch (error) {
            console.error('Error updating photo IDs in localStorage:', error);
        }
    }
    
    /**
     * Update photo data in IndexedDB
     */
    function updatePhotoInDB(photoData) {
        executeDbOperation(() => {
            console.log('Updating photo in database:', photoData.id);
            
            try {
                const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
                const store = transaction.objectStore(PHOTOS_STORE);
                
                const request = store.put(photoData);
                
                request.onsuccess = () => {
                    console.log('Photo updated successfully:', photoData.id);
                    
                    // Update localStorage backup
                    updatePhotoIdsInLocalStorage(photoData.id, 'add');
                };
                
                request.onerror = (event) => {
                    console.error('Error updating photo in database:', event.target.error);
                    
                    // Try again with a delay
                    setTimeout(() => {
                        console.log('Retrying photo update after error');
                        updatePhotoInDB(photoData);
                    }, 1000);
                };
                
                // Add transaction complete handler
                transaction.oncomplete = () => {
                    console.log('Photo update transaction completed');
                };
                
                transaction.onerror = (event) => {
                    console.error('Photo update transaction error:', event.target.error);
                };
            } catch (error) {
                console.error('Error in updatePhotoInDB:', error);
                
                // Try again after a delay
                setTimeout(() => {
                    console.log('Retrying photo update after exception');
                    updatePhotoInDB(photoData);
                }, 1000);
            }
        });
    }
    
    /**
     * Delete photo from IndexedDB and update localStorage backup
     */
    function deletePhotoFromDB(id) {
        executeDbOperation(() => {
            console.log('Deleting photo from database:', id);
            
            try {
                const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
                const store = transaction.objectStore(PHOTOS_STORE);
                
                const request = store.delete(id);
                
                request.onsuccess = () => {
                    console.log('Photo deleted successfully:', id);
                    // Update localStorage backup
                    updatePhotoIdsInLocalStorage(id, 'remove');
                };
                
                request.onerror = (event) => {
                    console.error('Error deleting photo from database:', event.target.error);
                };
                
                transaction.oncomplete = () => {
                    console.log('Photo delete transaction completed');
                };
            } catch (error) {
                console.error('Error in deletePhotoFromDB:', error);
            }
        });
    }
    
    /**
     * Handle photo double-click to open detail view
     */
    function handlePhotoDoubleClick(event) {
        const photoCard = event.target.closest('.photo-card');
        if (photoCard) {
            const photoId = photoCard.dataset.id;
            if (photoId) {
                // Open detail view in the same tab
                window.location.href = `photo-detail.html?id=${photoId}`;
            }
        }
    }
    
    /**
     * Handle clicks on the photo grid (remove button, edit/save metadata)
     */
    function handlePhotoGridClick(event) {
        // Handle remove button click
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
        
        // Handle edit button click for metadata
        if (event.target.classList.contains('edit-btn')) {
            const metadataField = event.target.closest('p');
            const photoCard = event.target.closest('.photo-card');
            
            if (metadataField && photoCard) {
                const fieldId = metadataField.dataset.fieldId;
                const valueElement = metadataField.querySelector('.metadata-value');
                const currentValue = valueElement.textContent;
                
                // Replace the value element with an input
                const inputElement = document.createElement('input');
                inputElement.type = 'text';
                inputElement.value = currentValue;
                inputElement.className = 'metadata-input';
                
                // Replace the edit button with a save button
                const saveButton = document.createElement('button');
                saveButton.className = 'save-btn';
                saveButton.textContent = 'Save';
                
                // Add event listener to the save button
                saveButton.addEventListener('click', () => {
                    saveMetadataValue(photoCard.dataset.id, fieldId, inputElement.value);
                    
                    // Update the value element
                    valueElement.textContent = inputElement.value;
                    
                    // Replace the input with the value element
                    metadataField.replaceChild(valueElement, inputElement);
                    
                    // Replace the save button with the edit button
                    metadataField.replaceChild(event.target, saveButton);
                });
                
                // Replace elements
                metadataField.replaceChild(inputElement, valueElement);
                metadataField.replaceChild(saveButton, event.target);
                
                // Focus the input
                inputElement.focus();
            }
        }
    }
    
    /**
     * Save metadata value for a photo
     */
    function saveMetadataValue(photoId, fieldId, value) {
        executeDbOperation(() => {
            console.log('Saving metadata value for photo:', photoId, 'field:', fieldId);
            
            try {
                const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
                const store = transaction.objectStore(PHOTOS_STORE);
                const request = store.get(photoId);
                
                request.onsuccess = (event) => {
                    const photo = event.target.result;
                    
                    if (photo) {
                        // Initialize customMetadata if it doesn't exist
                        if (!photo.customMetadata) {
                            photo.customMetadata = {};
                        }
                        
                        // Update the value
                        photo.customMetadata[fieldId] = value;
                        
                        // Save the updated photo
                        updatePhotoInDB(photo);
                    } else {
                        console.error('Photo not found for metadata update:', photoId);
                    }
                };
                
                request.onerror = (event) => {
                    console.error('Error getting photo for metadata update:', event.target.error);
                };
            } catch (error) {
                console.error('Error in saveMetadataValue:', error);
            }
        });
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