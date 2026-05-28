/**
 * Application Configuration
 */
const AppConfig = {
    // Supabase Settings
    SUPABASE_URL: "https://rngkgtvdrlhnupczwuzx.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZ2tndHZkcmxobnVwY3p3dXp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzUwNDAsImV4cCI6MjA5NTU1MTA0MH0.mtmOAD7rILbDsSHLYfepxkXxlNt1Du6WYCzXyjjWw_E",

    FLOORS: [
        { id: 1, name: '1F', label: '1階', imagePath: 'images/floor1.png' },
        { id: 2, name: '2F', label: '2階', imagePath: 'images/floor2.png' },
        { id: 3, name: '3F', label: '3階', imagePath: 'images/floor3.png' },
        { id: 4, name: '4F', label: '4階', imagePath: 'images/floor4.png' }
    ],
    // Merged Map Settings
    FLOOR_GAP: 200,
    DEFAULT_FLOOR_ID: 2,
    
    // Visual Settings
    STYLES: {
        node: {
            radius: 4,
            color: '#1a237e', // Navy
            highlightColor: '#c62828' // Red
        },
        edge: {
            width: 1,
            color: 'rgba(50, 50, 50, 0.1)',
            activeColor: '#1a237e',
            activeWidth: 4
        },
        path: {
            color: '#1a237e', // Navy
            width: 5,
            glowColor: 'rgba(197, 160, 89, 0.5)',
            glowBlur: 5
        }
    },

    // Logging
    ENABLE_LOGS: true
};

// Log Suppression Logic
if (AppConfig.ENABLE_LOGS === false) {
    console.log = function () { };
    // Optional: Suppress others if desired, but user specifically asked for "logs" usually implying INFO/LOG.
    // Keeping warn/error is safer for debugging critical failures.
    console.info = function () { };
    console.debug = function () { };
}
