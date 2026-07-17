using JippyServices.Algorithm.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace JippyServices.Algorithm.Data;

public class DataContext : DbContext
{
    public DataContext(DbContextOptions<DataContext> options) : base(options)
    { }

    public DbSet<Models.Route> Routes => Set<Models.Route>();
    public DbSet<Region> Regions => Set<Region>();
    public DbSet<RegionSnapshot> RegionSnapshots => Set<RegionSnapshot>();
    public DbSet<RegionStation> RegionStations => Set<RegionStation>();
    public DbSet<RoadClosure> RoadClosures => Set<RoadClosure>();
    public DbSet<RestrictedBordingZone> RestrictedBordingZones => Set<RestrictedBordingZone>();
    public DbSet<RoutesRestrictedInBoardingZone> RoutesRestrictedInBoardingZones => Set<RoutesRestrictedInBoardingZone>();
    public DbSet<Stop> Stops => Set<Stop>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Enable PostGIS extension
        modelBuilder.HasPostgresExtension("postgis");

        // RegionSnapshot → stations
        modelBuilder.Entity<RegionSnapshot>(e =>
        {
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
