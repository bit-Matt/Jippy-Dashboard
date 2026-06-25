using System.Text.Json;

namespace JippyServices.Algorithm.Weights;

/// <summary>
/// Concrete implementation of <see cref="IWeightsManager"/>.
/// Loads weights from <c>data/weights.json</c> on startup, falls back to the bundled
/// <c>Navigator/weights.json</c> and then to <see cref="AlgorithmWeights.Defaults"/>.
/// Persists changes synchronously on <see cref="Update"/> and asynchronously via a
/// background timer every five minutes.
/// </summary>
internal sealed class WeightsManager : IWeightsManager
{
    private readonly ILogger<WeightsManager> _logger;
    private readonly string _dataWeightsPath;
    private readonly string _defaultWeightsPath;
    private readonly Lock _lock = new();
    private readonly Timer _saveTimer;
    private AlgorithmWeights _current;
    private bool _dirty;
    
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };
    
    public WeightsManager(ILogger<WeightsManager> logger)
    {
        _logger = logger;
        
        // Paths for storing weights data
        var baseDir = AppContext.BaseDirectory;
        _dataWeightsPath = Path.Combine(baseDir, "data", "weights.json");
        _defaultWeightsPath = Path.Combine(baseDir, "Navigator", "weights.json");
        
        _current = LoadInitialWeights();
        PersistToDisk(force: true);
        
        // Periodic Saves
        _saveTimer = new Timer(
            _ => FlushIfDirty(),
            null,
            TimeSpan.FromMinutes(5),
            TimeSpan.FromMinutes(5));
    }
    
    public AlgorithmWeights Current
    {
        get
        {
            lock (_lock)
            {
                return _current;
            }
        }
    }
    
    public RoutingConfig GetConfig() => RoutingConfig.FromWeights(Current);
    
    public void Update(AlgorithmWeights weights)
    {
        lock (_lock)
        {
            _current = weights;
            _dirty = true;
        }

        PersistToDisk(force: true);
    }
    
    /// <summary>
    /// Load the initial weights at startup: try <c>data/weights.json</c> first,
    /// then the bundled default file, then <see cref="AlgorithmWeights.Defaults"/>.
    /// </summary>
    private AlgorithmWeights LoadInitialWeights()
    {
        if (File.Exists(_dataWeightsPath))
        {
            try
            {
                var json = File.ReadAllText(_dataWeightsPath);
                var loaded = JsonSerializer.Deserialize<AlgorithmWeights>(json, JsonOptions);
                if (loaded != null)
                {
                    _logger.LogInformation("Loaded algorithm weights from {Path}", _dataWeightsPath);
                    return loaded;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load weights from {Path}; falling back to defaults", _dataWeightsPath);
            }
        }

        var defaults = LoadDefaultWeightsFile();
        _logger.LogInformation(
            "Initialized algorithm weights from defaults (data file missing or invalid at {Path})",
            _dataWeightsPath);
        return defaults;
    }
    
    /// <summary>
    /// Attempt to read and deserialise the bundled <c>Navigator/weights.json</c> file.
    /// Returns <see cref="AlgorithmWeights.Defaults"/> if the file is missing or invalid.
    /// </summary>
    private AlgorithmWeights LoadDefaultWeightsFile()
    {
        if (File.Exists(_defaultWeightsPath))
        {
            try
            {
                var json = File.ReadAllText(_defaultWeightsPath);
                var loaded = JsonSerializer.Deserialize<AlgorithmWeights>(json, JsonOptions);
                if (loaded != null)
                    return loaded;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load default weights from {Path}", _defaultWeightsPath);
            }
        }

        return AlgorithmWeights.Defaults;
    }
    
    /// <summary>
    /// Called by the background timer every five minutes. Writes to disk only
    /// when the weights have been modified since the last save.
    /// </summary>
    private void FlushIfDirty()
    {
        lock (_lock)
        {
            if (!_dirty)
                return;
        }

        PersistToDisk(force: false);
    }
    
    /// <summary>
    /// Serialise the current weights to <c>data/weights.json</c>.
    /// When <paramref name="force"/> is <see langword="false"/>, skips the write if
    /// the dirty flag is not set. Creates the target directory if it does not exist.
    /// </summary>
    /// <param name="force">
    /// When <see langword="true"/>, write unconditionally (used on startup and on explicit updates).
    /// When <see langword="false"/>, write only if <c>_dirty</c> is set (used by the background timer).
    /// </param>
    private void PersistToDisk(bool force)
    {
        lock (_lock)
        {
            if (!force && !_dirty)
                return;

            try
            {
                var directory = Path.GetDirectoryName(_dataWeightsPath);
                if (!string.IsNullOrEmpty(directory))
                    Directory.CreateDirectory(directory);

                var json = JsonSerializer.Serialize(_current, JsonOptions);
                File.WriteAllText(_dataWeightsPath, json);
                _dirty = false;
                _logger.LogDebug("Persisted algorithm weights to {Path}", _dataWeightsPath);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to persist algorithm weights to {Path}", _dataWeightsPath);
            }
        }
    }
    
    public void Dispose() => _saveTimer.Dispose();
}
