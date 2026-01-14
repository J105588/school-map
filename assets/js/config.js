/**
 * Application Configuration
 */
const AppConfig = {
    FLOORS: [
        { id: 1, name: '1F', label: '1階', jsonPath: 'JSON/1.json', imagePath: 'images/floor1.png' },
        { id: 2, name: '2F', label: '2階', jsonPath: 'JSON/2.json', imagePath: 'images/floor2.png' },
        { id: 3, name: '3F', label: '3階', jsonPath: 'JSON/3.json', imagePath: 'images/floor3.png' },
        { id: 4, name: '4F', label: '4階', jsonPath: 'JSON/4.json', imagePath: 'images/floor4.png' }
    ],
    // Merged Map Settings
    FLOOR_GAP: 200,
    DEFAULT_FLOOR_ID: 2,

    // Order Priorities (Embedded to avoid fetch issues)
    DEFAULT_ORDER: {
        "default": 9999,
        "items": {
            "メインエントランス": 10,
            "総合案内所、文実本部": 20,
            "保健室": 30,
            "購買": 40,
            "國枝記念国際ホール": 50,
            "古賀記念アリーナ": 60
        }
    },

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
