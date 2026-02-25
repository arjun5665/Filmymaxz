// ===============================================
// MOVIEFLIX - COMPLETE APPLICATION JAVASCRIPT
// Final Version with Pagination (12 movies per page)
// ===============================================

// Supabase Configuration
const SUPABASE_URL = 'https://viwezrcslwjlnqwjxcox.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpd2V6cmNzbHdqbG5xd2p4Y294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODQ1NDEsImV4cCI6MjA4NzI2MDU0MX0.7DvWzpFhMaQ6umqhtqqxgDA54y-9AalM-EkfLA-OIik';

// Initialize Supabase Client
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cache Configuration
const CACHE_ADS_KEY = 'movieflix_ads_cache';
const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours

// Pagination Configuration
const MOVIES_PER_PAGE = 12;

// Global Variables
let currentPageMovies = [];
let currentPage = 1;
let totalMovies = 0;
let totalPages = 0;
let currentCategory = 'all';
let currentSearchTerm = '';
let adSettings = null;
let selectedMovieId = null;
let deleteMovieId = null;
let deleteMovieTitle = '';
let isLoading = false;

// Cache for pages (to avoid re-fetching visited pages)
let pageCache = {};

// Timer references
let interstitialTimerInterval = null;
let rewardedTimerInterval = null;

// For Admin
let allMovies = [];

// ===============================================
// UTILITY FUNCTIONS
// ===============================================

function isCacheValid(cacheKey) {
    try {
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return false;
        
        const data = JSON.parse(cached);
        if (!data || !data.timestamp || !data.data) return false;
        
        return (Date.now() - data.timestamp) < CACHE_DURATION;
    } catch (e) {
        return false;
    }
}

function getCachedData(cacheKey) {
    try {
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;
        return JSON.parse(cached).data;
    } catch (e) {
        return null;
    }
}

function setCacheData(cacheKey, data) {
    try {
        localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));
    } catch (e) {
        console.error('Cache write error:', e);
    }
}

function clearCache(cacheKey) {
    try {
        localStorage.removeItem(cacheKey);
    } catch (e) {
        console.error('Cache clear error:', e);
    }
}

function clearPageCache() {
    pageCache = {};
    console.log('📦 Page cache cleared');
}

function getPageCacheKey(page, category, search) {
    return `page_${page}_cat_${category}_search_${search}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = 'info-circle';
    let bgColor = '#333';
    
    if (type === 'success') {
        icon = 'check-circle';
        bgColor = '#46d369';
    } else if (type === 'error') {
        icon = 'exclamation-circle';
        bgColor = '#e50914';
    }
    
    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${escapeHtml(message)}</span>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 99999;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        font-family: 'Poppins', sans-serif;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function addAppStyles() {
    if (document.getElementById('app-dynamic-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'app-dynamic-styles';
    style.textContent = `
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(100px); }
            to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideOut {
            from { opacity: 1; transform: translateX(0); }
            to { opacity: 0; transform: translateX(100px); }
        }
    `;
    document.head.appendChild(style);
}

function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// ===============================================
// PAGE DETECTION & INITIALIZATION
// ===============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🎬 MovieFlix Starting...');
    
    addAppStyles();
    
    const currentPath = window.location.pathname.toLowerCase();
    const isAdminPage = currentPath.includes('admin');
    
    if (isAdminPage) {
        initAdminApp();
    } else {
        initUserApp();
    }
});

// ===============================================
// USER APP INITIALIZATION
// ===============================================

async function initUserApp() {
    console.log('🎬 Initializing User App with Pagination...');
    
    try {
        await loadAdSettings();
        await loadMoviesPage(1);
        setupUserEventListeners();
        console.log('✅ User App Ready!');
    } catch (error) {
        console.error('❌ User App Init Error:', error);
        showNotification('Error initializing app', 'error');
    }
}

// ===============================================
// AD SETTINGS
// ===============================================

async function loadAdSettings() {
    try {
        if (isCacheValid(CACHE_ADS_KEY)) {
            adSettings = getCachedData(CACHE_ADS_KEY);
            console.log('📢 Ads: Loaded from cache');
        } else {
            const { data, error } = await _supabase
                .from('app_controls')
                .select('*')
                .limit(1)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error;
            
            adSettings = data;
            if (data) setCacheData(CACHE_ADS_KEY, data);
            console.log('📢 Ads: Loaded from database');
        }
        
        if (adSettings?.show_ads) applyAdSettings();
    } catch (error) {
        console.error('Error loading ads:', error);
    }
}

function applyAdSettings() {
    if (!adSettings) return;
    
    // Top Banner
    if (adSettings.top_banner_link) {
        const topBanner = document.getElementById('topBanner');
        const topBannerImg = document.getElementById('topBannerImg');
        const topBannerLink = document.getElementById('topBannerLink');
        
        if (topBanner && topBannerImg && topBannerLink) {
            topBannerImg.src = adSettings.top_banner_link;
            topBannerLink.href = adSettings.top_banner_url || '#';
            topBanner.style.display = 'block';
        }
    }
    
    // Bottom Banner
    if (adSettings.bottom_banner_link) {
        const bottomBanner = document.getElementById('bottomBanner');
        const bottomBannerImg = document.getElementById('bottomBannerImg');
        const bottomBannerLink = document.getElementById('bottomBannerLink');
        
        if (bottomBanner && bottomBannerImg && bottomBannerLink) {
            bottomBannerImg.src = adSettings.bottom_banner_link;
            bottomBannerLink.href = adSettings.bottom_banner_url || '#';
            bottomBanner.style.display = 'block';
        }
    }
    
    // Interstitial Ad
    if (adSettings.interstitial_ad_link) {
        const img = document.getElementById('interstitialImg');
        const link = document.getElementById('interstitialLink');
        if (img) img.src = adSettings.interstitial_ad_link;
        if (link) link.href = adSettings.interstitial_ad_url || '#';
    }
    
    // Rewarded Ad
    if (adSettings.rewarded_ad_link) {
        const img = document.getElementById('rewardedImg');
        const video = document.getElementById('rewardedVideo');
        const link = document.getElementById('rewardedLink');
        const soundBtn = document.getElementById('soundToggleBtn');
        
        if (link) link.href = adSettings.rewarded_ad_url || '#';
        
        const url = adSettings.rewarded_ad_link.toLowerCase();
        const isVideo = url.includes('.mp4') || url.includes('.webm') || url.includes('.ogg');
        
        if (isVideo && video) {
            video.src = adSettings.rewarded_ad_link;
            video.style.display = 'block';
            if (img) img.style.display = 'none';
            if (soundBtn) soundBtn.style.display = 'flex';
        } else if (img) {
            img.src = adSettings.rewarded_ad_link;
            img.style.display = 'block';
            if (video) video.style.display = 'none';
            if (soundBtn) soundBtn.style.display = 'none';
        }
    }
}

// ===============================================
// MOVIES LOADING WITH PAGINATION
// ===============================================

async function loadMoviesPage(page, forceRefresh = false) {
    if (isLoading) return;
    
    isLoading = true;
    
    const loadingSpinner = document.getElementById('loadingSpinner');
    const moviesGrid = document.getElementById('moviesGrid');
    const noResults = document.getElementById('noResults');
    const pagination = document.getElementById('pagination');
    const pageJump = document.getElementById('pageJump');
    
    // Show loading
    if (loadingSpinner) loadingSpinner.style.display = 'flex';
    if (moviesGrid) moviesGrid.innerHTML = '';
    if (noResults) noResults.style.display = 'none';
    if (pagination) pagination.style.display = 'none';
    if (pageJump) pageJump.style.display = 'none';
    
    // Disable pagination buttons
    updatePaginationButtons(true);
    
    try {
        // Create cache key for this specific page/filter combination
        const cacheKey = getPageCacheKey(page, currentCategory, currentSearchTerm);
        
        // Check page cache (not localStorage, just memory cache)
        if (!forceRefresh && pageCache[cacheKey]) {
            console.log(`📦 Page ${page}: Loaded from memory cache`);
            currentPageMovies = pageCache[cacheKey].movies;
            totalMovies = pageCache[cacheKey].total;
            totalPages = Math.ceil(totalMovies / MOVIES_PER_PAGE);
            currentPage = page;
        } else {
            console.log(`🌐 Page ${page}: Fetching from server...`);
            
            // Calculate range for this page
            const from = (page - 1) * MOVIES_PER_PAGE;
            const to = from + MOVIES_PER_PAGE - 1;
            
            // Build query
            let query = _supabase
                .from('movies')
                .select('*', { count: 'exact' });
            
            // Apply category filter
            if (currentCategory !== 'all') {
                query = query.eq('category', currentCategory);
            }
            
            // Apply search filter
            if (currentSearchTerm) {
                query = query.or(`title.ilike.%${currentSearchTerm}%,story.ilike.%${currentSearchTerm}%`);
            }
            
            // Order and paginate
            query = query
                .order('created_at', { ascending: false })
                .range(from, to);
            
            const { data, error, count } = await query;
            
            if (error) throw error;
            
            currentPageMovies = data || [];
            totalMovies = count || 0;
            totalPages = Math.ceil(totalMovies / MOVIES_PER_PAGE);
            currentPage = page;
            
            // Store in memory cache
            pageCache[cacheKey] = {
                movies: currentPageMovies,
                total: totalMovies
            };
            
            console.log(`✅ Loaded ${currentPageMovies.length} movies (Total: ${totalMovies})`);
        }
        
        // Render movies
        renderMovies();
        updatePaginationUI();
        
        // Scroll to top on page change
        if (page > 1 || forceRefresh) {
            scrollToTop();
        }
        
    } catch (error) {
        console.error('Error loading movies:', error);
        showNotification('Error loading movies', 'error');
        
        if (moviesGrid) {
            moviesGrid.innerHTML = '<p style="text-align:center;color:#e50914;padding:40px;">Error loading movies. Please try again.</p>';
        }
    } finally {
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        isLoading = false;
        updatePaginationButtons(false);
    }
}

async function goToPage(page) {
    if (page < 1 || page > totalPages || page === currentPage || isLoading) return;
    await loadMoviesPage(page);
}

async function nextPage() {
    if (currentPage < totalPages && !isLoading) {
        await loadMoviesPage(currentPage + 1);
    }
}

async function prevPage() {
    if (currentPage > 1 && !isLoading) {
        await loadMoviesPage(currentPage - 1);
    }
}

function renderMovies() {
    const moviesGrid = document.getElementById('moviesGrid');
    const noResults = document.getElementById('noResults');
    
    if (!moviesGrid) return;
    
    if (currentPageMovies.length === 0) {
        moviesGrid.innerHTML = '';
        if (noResults) noResults.style.display = 'block';
        return;
    }
    
    if (noResults) noResults.style.display = 'none';
    
    // Add page transition animation
    moviesGrid.classList.add('page-transition');
    setTimeout(() => moviesGrid.classList.remove('page-transition'), 300);
    
    moviesGrid.innerHTML = currentPageMovies.map(movie => `
        <div class="movie-card" data-id="${movie.id}">
            <div class="movie-poster">
                <img src="${escapeHtml(movie.poster_link) || 'https://via.placeholder.com/300x450/1a1a1a/e50914?text=No+Poster'}" 
                     alt="${escapeHtml(movie.title)}"
                     onerror="this.src='https://via.placeholder.com/300x450/1a1a1a/e50914?text=No+Poster'"
                     loading="lazy">
                <div class="play-overlay">
                    <i class="fas fa-play-circle"></i>
                </div>
                ${movie.rating ? `<div class="movie-rating"><i class="fas fa-star"></i> ${movie.rating}</div>` : ''}
                ${movie.category ? `<div class="movie-category">${escapeHtml(movie.category)}</div>` : ''}
            </div>
            <div class="movie-info">
                <h3 class="movie-title">${escapeHtml(movie.title)}</h3>
                ${movie.runtime ? `<p class="movie-runtime"><i class="fas fa-clock"></i> ${movie.runtime} min</p>` : ''}
            </div>
        </div>
    `).join('');
    
    // Add click listeners
    moviesGrid.querySelectorAll('.movie-card').forEach(card => {
        card.addEventListener('click', () => showMovieDetail(card.dataset.id));
    });
}

function updatePaginationUI() {
    const pagination = document.getElementById('pagination');
    const pageJump = document.getElementById('pageJump');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const currentPageDisplay = document.getElementById('currentPageDisplay');
    const totalPagesDisplay = document.getElementById('totalPagesDisplay');
    const pageJumpInput = document.getElementById('pageJumpInput');
    
    // Show/hide pagination based on total pages
    if (totalPages > 1) {
        if (pagination) pagination.style.display = 'flex';
        if (pageJump) pageJump.style.display = 'flex';
    } else {
        if (pagination) pagination.style.display = 'none';
        if (pageJump) pageJump.style.display = 'none';
    }
    
    // Update page display
    if (currentPageDisplay) currentPageDisplay.textContent = `Page ${currentPage}`;
    if (totalPagesDisplay) totalPagesDisplay.textContent = totalPages;
    
    // Update buttons
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    
    // Update page jump input
    if (pageJumpInput) {
        pageJumpInput.value = currentPage;
        pageJumpInput.max = totalPages;
    }
    
    // Update cache status
    updateCacheStatus();
}

function updatePaginationButtons(loading) {
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageJumpBtn = document.getElementById('pageJumpBtn');
    
    if (loading) {
        if (prevBtn) prevBtn.classList.add('loading');
        if (nextBtn) nextBtn.classList.add('loading');
        if (pageJumpBtn) pageJumpBtn.disabled = true;
    } else {
        if (prevBtn) prevBtn.classList.remove('loading');
        if (nextBtn) nextBtn.classList.remove('loading');
        if (pageJumpBtn) pageJumpBtn.disabled = false;
    }
}

async function applyFilters() {
    // Clear page cache when filters change
    clearPageCache();
    // Go back to page 1
    await loadMoviesPage(1);
}

function updateCacheStatus() {
    const cacheStatus = document.getElementById('cacheStatus');
    if (!cacheStatus) return;
    
    const cachedPages = Object.keys(pageCache).length;
    cacheStatus.textContent = `📦 Page ${currentPage}/${totalPages} | ${totalMovies} total movies | ${cachedPages} pages cached`;
    cacheStatus.classList.add('show');
}

// ===============================================
// MOVIE DETAIL MODAL
// ===============================================

function showMovieDetail(movieId) {
    const movie = currentPageMovies.find(m => String(m.id) === String(movieId));
    if (!movie) {
        console.error('Movie not found:', movieId);
        return;
    }
    
    selectedMovieId = movieId;
    
    if (adSettings?.show_ads && adSettings?.interstitial_ad_link) {
        showInterstitialAd(() => displayMovieModal(movie));
    } else {
        displayMovieModal(movie);
    }
}

function displayMovieModal(movie) {
    const modal = document.getElementById('movieModal');
    const modalBody = document.getElementById('modalBody');
    
    if (!modal || !modalBody) return;
    
    const hasDownloads = movie.link_480p || movie.link_720p || movie.link_1080p;
    const needsRewardedAd = adSettings?.show_ads && adSettings?.rewarded_ad_link;
    
    modalBody.innerHTML = `
        <div class="movie-detail">
            <div class="movie-detail-header">
                <div class="movie-detail-poster">
                    <img src="${escapeHtml(movie.poster_link) || 'https://via.placeholder.com/300x450/1a1a1a/e50914?text=No+Poster'}" 
                         alt="${escapeHtml(movie.title)}"
                         onerror="this.src='https://via.placeholder.com/300x450/1a1a1a/e50914?text=No+Poster'">
                </div>
                <div class="movie-detail-info">
                    <h1>${escapeHtml(movie.title)}</h1>
                    <div class="movie-meta">
                        ${movie.rating ? `<div class="movie-meta-item"><i class="fas fa-star"></i> ${movie.rating}/10</div>` : ''}
                        ${movie.runtime ? `<div class="movie-meta-item"><i class="fas fa-clock"></i> ${movie.runtime} min</div>` : ''}
                        ${movie.category ? `<div class="movie-meta-item"><i class="fas fa-tag"></i> ${escapeHtml(movie.category)}</div>` : ''}
                    </div>
                    <div class="movie-story">
                        <h3>Synopsis</h3>
                        <p>${escapeHtml(movie.story) || 'No description available.'}</p>
                    </div>
                </div>
            </div>
            ${hasDownloads ? `
                <div class="download-section">
                    <h3><i class="fas fa-download"></i> Download Links</h3>
                    <div id="downloadContent">
                        ${needsRewardedAd ? `
                            <div class="download-locked">
                                <i class="fas fa-lock"></i>
                                <h4>Downloads Locked</h4>
                                <p>Watch a short ad to unlock download links</p>
                                <button class="watch-ad-btn" id="watchAdBtn">
                                    <i class="fas fa-play"></i> Watch Ad to Unlock
                                </button>
                            </div>
                        ` : generateDownloadButtonsHTML(movie)}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    const watchAdBtn = document.getElementById('watchAdBtn');
    if (watchAdBtn) {
        watchAdBtn.addEventListener('click', showRewardedAd);
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function generateDownloadButtonsHTML(movie) {
    let html = '<div class="download-buttons">';
    if (movie.link_480p) html += `<a href="${escapeHtml(movie.link_480p)}" class="download-btn" target="_blank"><i class="fas fa-download"></i> 480p</a>`;
    if (movie.link_720p) html += `<a href="${escapeHtml(movie.link_720p)}" class="download-btn" target="_blank"><i class="fas fa-download"></i> 720p HD</a>`;
    if (movie.link_1080p) html += `<a href="${escapeHtml(movie.link_1080p)}" class="download-btn" target="_blank"><i class="fas fa-download"></i> 1080p Full HD</a>`;
    html += '</div>';
    return html;
}

function showDownloadButtons() {
    const movie = currentPageMovies.find(m => String(m.id) === String(selectedMovieId));
    const downloadContent = document.getElementById('downloadContent');
    if (movie && downloadContent) {
        downloadContent.innerHTML = generateDownloadButtonsHTML(movie);
    }
}

// ===============================================
// INTERSTITIAL AD (5 SECONDS)
// ===============================================

function showInterstitialAd(callback) {
    const modal = document.getElementById('interstitialModal');
    const timerDisplay = document.getElementById('interstitialTimer');
    const skipBtn = document.getElementById('skipInterstitial');
    
    if (!modal || !timerDisplay || !skipBtn) {
        if (callback) callback();
        return;
    }
    
    if (interstitialTimerInterval) {
        clearInterval(interstitialTimerInterval);
        interstitialTimerInterval = null;
    }
    
    const newSkipBtn = skipBtn.cloneNode(true);
    skipBtn.parentNode.replaceChild(newSkipBtn, skipBtn);
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    let seconds = 5;
    timerDisplay.textContent = seconds;
    newSkipBtn.disabled = true;
    newSkipBtn.textContent = `Please wait... ${seconds}s`;
    
    interstitialTimerInterval = setInterval(() => {
        seconds--;
        timerDisplay.textContent = seconds;
        newSkipBtn.textContent = `Please wait... ${seconds}s`;
        
        if (seconds <= 0) {
            clearInterval(interstitialTimerInterval);
            interstitialTimerInterval = null;
            newSkipBtn.disabled = false;
            newSkipBtn.textContent = '▶ Continue';
        }
    }, 1000);
    
    newSkipBtn.addEventListener('click', function() {
        if (this.disabled) return;
        
        if (interstitialTimerInterval) {
            clearInterval(interstitialTimerInterval);
            interstitialTimerInterval = null;
        }
        
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        if (callback) callback();
    });
}

// ===============================================
// REWARDED AD (10 SECONDS) WITH SOUND
// ===============================================

function showRewardedAd() {
    if (!adSettings?.show_ads || !adSettings?.rewarded_ad_link) {
        showDownloadButtons();
        return;
    }
    
    const modal = document.getElementById('rewardedModal');
    const timerDisplay = document.getElementById('rewardedTimer');
    const skipBtn = document.getElementById('skipRewarded');
    const video = document.getElementById('rewardedVideo');
    const soundBtn = document.getElementById('soundToggleBtn');
    
    if (!modal || !timerDisplay || !skipBtn) {
        showDownloadButtons();
        return;
    }
    
    if (rewardedTimerInterval) {
        clearInterval(rewardedTimerInterval);
        rewardedTimerInterval = null;
    }
    
    const newSkipBtn = skipBtn.cloneNode(true);
    skipBtn.parentNode.replaceChild(newSkipBtn, skipBtn);
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    const isVideoAd = video && video.src && video.style.display !== 'none';
    
    if (isVideoAd) {
        video.muted = true;
        video.currentTime = 0;
        video.play().catch(e => console.log('Autoplay blocked'));
        
        if (soundBtn) {
            soundBtn.style.display = 'flex';
            soundBtn.classList.remove('unmuted');
            soundBtn.innerHTML = '<i class="fas fa-volume-mute"></i><span>Tap to Unmute</span>';
            
            const newSoundBtn = soundBtn.cloneNode(true);
            soundBtn.parentNode.replaceChild(newSoundBtn, soundBtn);
            
            newSoundBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                if (video.muted) {
                    video.muted = false;
                    this.classList.add('unmuted');
                    this.innerHTML = '<i class="fas fa-volume-up"></i><span>Sound On</span>';
                } else {
                    video.muted = true;
                    this.classList.remove('unmuted');
                    this.innerHTML = '<i class="fas fa-volume-mute"></i><span>Tap to Unmute</span>';
                }
            });
        }
    } else {
        if (soundBtn) soundBtn.style.display = 'none';
    }
    
    let seconds = 10;
    timerDisplay.textContent = seconds;
    newSkipBtn.disabled = true;
    newSkipBtn.textContent = `Please wait... ${seconds}s`;
    
    rewardedTimerInterval = setInterval(() => {
        seconds--;
        timerDisplay.textContent = seconds;
        newSkipBtn.textContent = `Please wait... ${seconds}s`;
        
        if (seconds <= 0) {
            clearInterval(rewardedTimerInterval);
            rewardedTimerInterval = null;
            newSkipBtn.disabled = false;
            newSkipBtn.textContent = '🎁 Claim Reward';
        }
    }, 1000);
    
    newSkipBtn.addEventListener('click', function() {
        if (this.disabled) return;
        
        if (rewardedTimerInterval) {
            clearInterval(rewardedTimerInterval);
            rewardedTimerInterval = null;
        }
        
        if (video) {
            video.pause();
            video.muted = true;
        }
        
        const currentSoundBtn = document.getElementById('soundToggleBtn');
        if (currentSoundBtn) {
            currentSoundBtn.classList.remove('unmuted');
        }
        
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        showDownloadButtons();
        showNotification('🎉 Downloads unlocked!', 'success');
    });
}

// ===============================================
// USER EVENT LISTENERS
// ===============================================

function setupUserEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    let searchTimeout;
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentSearchTerm = this.value.trim().toLowerCase();
                applyFilters();
            }, 500); // Debounce 500ms
        });
        
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                clearTimeout(searchTimeout);
                currentSearchTerm = this.value.trim().toLowerCase();
                applyFilters();
            }
        });
    }
    
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            clearTimeout(searchTimeout);
            currentSearchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
            applyFilters();
        });
    }
    
    // Category filters
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.dataset.category;
            applyFilters();
        });
    });
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async function() {
            this.classList.add('spinning');
            clearPageCache();
            clearCache(CACHE_ADS_KEY);
            await loadAdSettings();
            await loadMoviesPage(1, true);
            this.classList.remove('spinning');
            showNotification('Data refreshed!', 'success');
        });
    }
    
    // Pagination - Previous
    const prevBtn = document.getElementById('prevPageBtn');
    if (prevBtn) {
        prevBtn.addEventListener('click', prevPage);
    }
    
    // Pagination - Next
    const nextBtn = document.getElementById('nextPageBtn');
    if (nextBtn) {
        nextBtn.addEventListener('click', nextPage);
    }
    
    // Page Jump
    const pageJumpBtn = document.getElementById('pageJumpBtn');
    const pageJumpInput = document.getElementById('pageJumpInput');
    
    if (pageJumpBtn && pageJumpInput) {
        pageJumpBtn.addEventListener('click', () => {
            const page = parseInt(pageJumpInput.value);
            if (page >= 1 && page <= totalPages) {
                goToPage(page);
            } else {
                showNotification(`Please enter a page between 1 and ${totalPages}`, 'error');
            }
        });
        
        pageJumpInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const page = parseInt(pageJumpInput.value);
                if (page >= 1 && page <= totalPages) {
                    goToPage(page);
                } else {
                    showNotification(`Please enter a page between 1 and ${totalPages}`, 'error');
                }
            }
        });
    }
    
    // Close movie modal
    const closeModal = document.getElementById('closeModal');
    const movieModal = document.getElementById('movieModal');
    
    if (closeModal && movieModal) {
        closeModal.addEventListener('click', () => {
            movieModal.classList.remove('active');
            document.body.style.overflow = '';
        });
        
        movieModal.addEventListener('click', (e) => {
            if (e.target === movieModal) {
                movieModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }
    
    // ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                modal.classList.remove('active');
            });
            document.body.style.overflow = '';
        }
    });
    
    // Keyboard navigation for pagination
    document.addEventListener('keydown', (e) => {
        // Only if no modal is open and not typing in input
        if (document.querySelector('.modal.active')) return;
        if (document.activeElement.tagName === 'INPUT') return;
        
        if (e.key === 'ArrowLeft') {
            prevPage();
        } else if (e.key === 'ArrowRight') {
            nextPage();
        }
    });
}

// ===============================================
// ADMIN APP
// ===============================================

async function initAdminApp() {
    console.log('🔧 Initializing Admin App...');
    
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (session) {
        showAdminDashboard(session.user);
    } else {
        showLoginSection();
    }
    
    setupAdminEventListeners();
    
    _supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            showAdminDashboard(session.user);
        } else if (event === 'SIGNED_OUT') {
            showLoginSection();
        }
    });
}

function showLoginSection() {
    const login = document.getElementById('loginSection');
    const dashboard = document.getElementById('adminDashboard');
    if (login) login.style.display = 'flex';
    if (dashboard) dashboard.style.display = 'none';
}

function showAdminDashboard(user) {
    const login = document.getElementById('loginSection');
    const dashboard = document.getElementById('adminDashboard');
    const email = document.getElementById('adminEmail');
    
    if (login) login.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
    if (email) email.textContent = user.email;
    
    loadAdminMovies();
    loadAdControlsData();
}

async function handleLogin(email, password) {
    const error = document.getElementById('loginError');
    const btn = document.querySelector('.login-btn');
    
    if (error) error.classList.remove('show');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
    }
    
    try {
        const { error: authError } = await _supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        showNotification('Login successful!', 'success');
    } catch (e) {
        if (error) {
            error.textContent = e.message || 'Login failed';
            error.classList.add('show');
        }
        showNotification('Login failed!', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
        }
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    showNotification('Logged out', 'info');
}

async function loadAdminMovies() {
    const list = document.getElementById('adminMoviesList');
    if (!list) return;
    
    list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading...</p></div>';
    
    try {
        const { data, error } = await _supabase
            .from('movies')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        allMovies = data || [];
        renderAdminMovies(allMovies);
    } catch (e) {
        list.innerHTML = '<p style="color:#e50914;text-align:center;">Error loading movies</p>';
    }
}

function renderAdminMovies(movies) {
    const list = document.getElementById('adminMoviesList');
    if (!list) return;
    
    if (movies.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#808080;padding:40px;">No movies found</p>';
        return;
    }
    
    list.innerHTML = movies.map(m => `
        <div class="admin-movie-item">
            <img class="admin-movie-poster" src="${escapeHtml(m.poster_link) || 'https://via.placeholder.com/60x90/1a1a1a/e50914?text=No'}" onerror="this.src='https://via.placeholder.com/60x90/1a1a1a/e50914?text=No'">
            <div class="admin-movie-info">
                <h4>${escapeHtml(m.title)}</h4>
                <p>${escapeHtml(m.category) || 'No category'} • ${m.rating || 'N/A'} ⭐</p>
            </div>
            <div class="admin-movie-actions">
                <button class="edit-btn" data-action="edit" data-id="${m.id}"><i class="fas fa-edit"></i> Edit</button>
                <button class="delete-btn" data-action="delete" data-id="${m.id}" data-title="${escapeHtml(m.title)}"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>
    `).join('');
    
    setupMovieActionListeners();
}

function setupMovieActionListeners() {
    const list = document.getElementById('adminMoviesList');
    if (!list) return;
    
    list.addEventListener('click', e => {
        const editBtn = e.target.closest('[data-action="edit"]');
        const deleteBtn = e.target.closest('[data-action="delete"]');
        
        if (editBtn) editMovie(editBtn.dataset.id);
        if (deleteBtn) confirmDeleteMovie(deleteBtn.dataset.id, deleteBtn.dataset.title);
    });
}

function editMovie(id) {
    const movie = allMovies.find(m => String(m.id) === String(id));
    if (!movie) return;
    
    document.getElementById('editMovieId').value = movie.id;
    document.getElementById('editMovieTitle').value = movie.title || '';
    document.getElementById('editMovieCategory').value = movie.category || '';
    document.getElementById('editMovieStory').value = movie.story || '';
    document.getElementById('editMoviePoster').value = movie.poster_link || '';
    document.getElementById('editMovieRuntime').value = movie.runtime || '';
    document.getElementById('editMovieRating').value = movie.rating || '';
    document.getElementById('editLink480p').value = movie.link_480p || '';
    document.getElementById('editLink720p').value = movie.link_720p || '';
    document.getElementById('editLink1080p').value = movie.link_1080p || '';
    
    document.getElementById('editMovieModal').classList.add('active');
}

function confirmDeleteMovie(id, title) {
    deleteMovieId = id;
    document.getElementById('deleteMovieTitle').textContent = title;
    document.getElementById('deleteModal').classList.add('active');
}

async function addMovie(data) {
    const msg = document.getElementById('addMovieMsg');
    const btn = document.querySelector('#addMovieForm .submit-btn');
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    }
    
    try {
        const { error } = await _supabase.from('movies').insert([data]);
        if (error) throw error;
        
        if (msg) {
            msg.textContent = '✅ Movie added!';
            msg.className = 'form-message success';
            msg.style.display = 'block';
        }
        
        document.getElementById('addMovieForm').reset();
        loadAdminMovies();
        showNotification('Movie added!', 'success');
    } catch (e) {
        if (msg) {
            msg.textContent = '❌ ' + e.message;
            msg.className = 'form-message error';
            msg.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Add Movie';
        }
    }
}

async function updateMovie(id, data) {
    const msg = document.getElementById('editMovieMsg');
    const btn = document.querySelector('#editMovieForm .submit-btn');
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    }
    
    try {
        const { error } = await _supabase.from('movies').update(data).eq('id', id);
        if (error) throw error;
        
        if (msg) {
            msg.textContent = '✅ Updated!';
            msg.className = 'form-message success';
            msg.style.display = 'block';
        }
        
        loadAdminMovies();
        showNotification('Movie updated!', 'success');
        
        setTimeout(() => {
            document.getElementById('editMovieModal').classList.remove('active');
        }, 1000);
    } catch (e) {
        if (msg) {
            msg.textContent = '❌ ' + e.message;
            msg.className = 'form-message error';
            msg.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Update Movie';
        }
    }
}

async function deleteMovie(id) {
    const btn = document.getElementById('confirmDelete');
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    
    try {
        const { error } = await _supabase.from('movies').delete().eq('id', id);
        if (error) throw error;
        
        loadAdminMovies();
        showNotification('Movie deleted!', 'success');
    } catch (e) {
        showNotification('Error: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Delete';
        }
        document.getElementById('deleteModal').classList.remove('active');
        deleteMovieId = null;
    }
}

async function loadAdControlsData() {
    try {
        const { data } = await _supabase.from('app_controls').select('*').limit(1).single();
        
        if (data) {
            document.getElementById('showAds').checked = data.show_ads || false;
            document.getElementById('topBannerLink').value = data.top_banner_link || '';
            document.getElementById('topBannerUrl').value = data.top_banner_url || '';
            document.getElementById('bottomBannerLink').value = data.bottom_banner_link || '';
            document.getElementById('bottomBannerUrl').value = data.bottom_banner_url || '';
            document.getElementById('interstitialAdLink').value = data.interstitial_ad_link || '';
            document.getElementById('interstitialAdUrl').value = data.interstitial_ad_url || '';
            document.getElementById('rewardedAdLink').value = data.rewarded_ad_link || '';
            document.getElementById('rewardedAdUrl').value = data.rewarded_ad_url || '';
        }
    } catch (e) {
        console.error('Error loading ad controls:', e);
    }
}

async function saveAdControls(data) {
    const msg = document.getElementById('adControlsMsg');
    const btn = document.querySelector('#adControlsForm .submit-btn');
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }
    
    try {
        const { data: existing } = await _supabase.from('app_controls').select('id').limit(1).single();
        
        if (existing) {
            await _supabase.from('app_controls').update(data).eq('id', existing.id);
        } else {
            await _supabase.from('app_controls').insert([data]);
        }
        
        if (msg) {
            msg.textContent = '✅ Saved!';
            msg.className = 'form-message success';
            msg.style.display = 'block';
        }
        
        clearCache(CACHE_ADS_KEY);
        showNotification('Ad settings saved!', 'success');
    } catch (e) {
        if (msg) {
            msg.textContent = '❌ ' + e.message;
            msg.className = 'form-message error';
            msg.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Save Ad Settings';
        }
    }
}

function setupAdminEventListeners() {
    // Login
    document.getElementById('loginForm')?.addEventListener('submit', e => {
        e.preventDefault();
        handleLogin(
            document.getElementById('email').value.trim(),
            document.getElementById('password').value
        );
    });
    
    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    
    // Nav tabs
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab + 'Tab')?.classList.add('active');
        });
    });
    
    // Add movie
    document.getElementById('addMovieForm')?.addEventListener('submit', e => {
        e.preventDefault();
        addMovie({
            title: document.getElementById('movieTitle').value.trim(),
            category: document.getElementById('movieCategory').value,
            story: document.getElementById('movieStory').value.trim() || null,
            poster_link: document.getElementById('moviePoster').value.trim() || null,
            runtime: parseInt(document.getElementById('movieRuntime').value) || null,
            rating: parseFloat(document.getElementById('movieRating').value) || null,
            link_480p: document.getElementById('link480p').value.trim() || null,
            link_720p: document.getElementById('link720p').value.trim() || null,
            link_1080p: document.getElementById('link1080p').value.trim() || null
        });
    });
    
    // Edit movie
    document.getElementById('editMovieForm')?.addEventListener('submit', e => {
        e.preventDefault();
        updateMovie(document.getElementById('editMovieId').value, {
            title: document.getElementById('editMovieTitle').value.trim(),
            category: document.getElementById('editMovieCategory').value,
            story: document.getElementById('editMovieStory').value.trim() || null,
            poster_link: document.getElementById('editMoviePoster').value.trim() || null,
            runtime: parseInt(document.getElementById('editMovieRuntime').value) || null,
            rating: parseFloat(document.getElementById('editMovieRating').value) || null,
            link_480p: document.getElementById('editLink480p').value.trim() || null,
            link_720p: document.getElementById('editLink720p').value.trim() || null,
            link_1080p: document.getElementById('editLink1080p').value.trim() || null
        });
    });
    
    // Close edit modal
    document.getElementById('closeEditModal')?.addEventListener('click', () => {
        document.getElementById('editMovieModal').classList.remove('active');
    });
    
    // Delete modal
    document.getElementById('cancelDelete')?.addEventListener('click', () => {
        document.getElementById('deleteModal').classList.remove('active');
    });
    
    document.getElementById('confirmDelete')?.addEventListener('click', () => {
        if (deleteMovieId) deleteMovie(deleteMovieId);
    });
    
    // Search
    document.getElementById('adminSearchInput')?.addEventListener('input', e => {
        const term = e.target.value.toLowerCase();
        renderAdminMovies(allMovies.filter(m => m.title.toLowerCase().includes(term)));
    });
    
    // Ad controls
    document.getElementById('adControlsForm')?.addEventListener('submit', e => {
        e.preventDefault();
        saveAdControls({
            show_ads: document.getElementById('showAds').checked,
            top_banner_link: document.getElementById('topBannerLink').value.trim() || null,
            top_banner_url: document.getElementById('topBannerUrl').value.trim() || null,
            bottom_banner_link: document.getElementById('bottomBannerLink').value.trim() || null,
            bottom_banner_url: document.getElementById('bottomBannerUrl').value.trim() || null,
            interstitial_ad_link: document.getElementById('interstitialAdLink').value.trim() || null,
            interstitial_ad_url: document.getElementById('interstitialAdUrl').value.trim() || null,
            rewarded_ad_link: document.getElementById('rewardedAdLink').value.trim() || null,
            rewarded_ad_url: document.getElementById('rewardedAdUrl').value.trim() || null
        });
    });
    
    // Close modals
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

// ===============================================
// INITIALIZATION
// ===============================================

console.log('🎬 MovieFlix Loaded');
console.log('📄 Pagination: 12 movies per page');
console.log('🔊 Video Sound: Enabled');
