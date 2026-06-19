using JippyServices.Algorithm.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace JippyServices.Algorithm.Data;

public class DataContext : DbContext
{
    public DataContext(DbContextOptions<DataContext> options) : base(options)
    { }

    public DbSet<Models.Route> Routes => Set<Models.Route>();
    public DbSet<RegionMarker> RegionMarkers => Set<RegionMarker>();
    public DbSet<RegionSnapshot> RegionSnapshots => Set<RegionSnapshot>();
    public DbSet<RegionSequence> RegionSequences => Set<RegionSequence>();
    public DbSet<RegionStation> RegionStations => Set<RegionStation>();
    public DbSet<RoadClosure> RoadClosures => Set<RoadClosure>();
    public DbSet<RestrictedBordingZone> RestrictedBordingZones => Set<RestrictedBordingZone>();
    public DbSet<RoutesRestrictedInBoardingZone> RoutesRestrictedInBoardingZones => Set<RoutesRestrictedInBoardingZone>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Enable PostGIS extension
        modelBuilder.HasPostgresExtension("postgis");

        // RegionSnapshot → sequences and stations
        modelBuilder.Entity<RegionSnapshot>(e =>
        {
            e.HasMany(rs => rs.Sequences)
                .WithOne(seq => seq.RegionSnapshot)
                .HasForeignKey(seq => seq.RegionSnapshotId);

            e.HasMany(rs => rs.Stations)
                .WithOne(st => st.RegionSnapshot)
                .HasForeignKey(st => st.RegionSnapshotId);
        });

        // RestrictedBordingZone → routes (join)
        modelBuilder.Entity<RestrictedBordingZone>(e =>
        {
            e.HasMany(z => z.Routes)
                .WithOne(r => r.RestrictionZone)
                .HasForeignKey(r => r.RestrictionZoneId);
        });
    }
}
