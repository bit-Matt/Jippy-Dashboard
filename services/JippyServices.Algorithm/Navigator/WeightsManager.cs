using System.Text.Json;

namespace JippyServices.Algorithm.Navigator;

/// <summary>
/// Singleton that loads, persists, and serves algorithm weights from weights.json.
/// </summary>
public sealed class WeightsManager : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private readonly string _dataWeightsPath;
    private readonly string _defaultWeightsPath;
    private readonly ILogger<WeightsManager> _logger;
    private readonly object _lock = new();
    private readonly Timer _saveTimer;
    private AlgorithmWeights _current;
    private bool _dirty;

    public WeightsManager(ILogger<WeightsManager> logger)
    {
        _logger = logger;
        var baseDir = AppContext.BaseDirectory;
        _dataWeightsPath = Path.Combine(baseDir, "data", "weights.json");
        _defaultWeightsPath = Path.Combine(baseDir, "Navigator", "weights.json");

        _current = LoadInitialWeights();
        PersistToDisk(force: true);

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

    private void FlushIfDirty()
    {
        lock (_lock)
        {
            if (!_dirty)
                return;
        }

        PersistToDisk(force: false);
    }

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
