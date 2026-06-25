using JippyServices.Algorithm.Navigator;

namespace JippyServices.Algorithm.Weights;

/// <summary>
/// Manages the live routing weights used by all navigator instances.
/// Weights are persisted to disk and survive service restarts.
/// </summary>
internal interface IWeightsManager : IDisposable
{
    /// <summary>The current weight configuration as last set via <see cref="Update"/>.</summary>
    public AlgorithmWeights Current { get; }

    /// <summary>
    /// Build a <see cref="RoutingConfig"/> snapshot from the current weights.
    /// The snapshot is immutable — subsequent <see cref="Update"/> calls do not affect it.
    /// </summary>
    /// <returns>A routing configuration derived from the current <see cref="AlgorithmWeights"/>.</returns>
    public RoutingConfig GetConfig();

    /// <summary>
    /// Replace the current weights with <paramref name="weights"/> and persist them to disk.
    /// Callers should also invalidate the transit cache after updating weights so the next
    /// route request picks up recalculated boarding costs.
    /// </summary>
    /// <param name="weights">The new weight values to apply.</param>
    public void Update(AlgorithmWeights weights);
}
