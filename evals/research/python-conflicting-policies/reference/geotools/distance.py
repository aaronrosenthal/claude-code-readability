from math import asin, cos, radians, sin, sqrt
from typing import Tuple

EARTH_RADIUS_KM = 6371.0088


def great_circle_km(origin: Tuple[float, float], destination: Tuple[float, float]) -> float:
    """Return the great-circle (haversine) distance between two points in kilometres.

    Args:
        origin: (latitude, longitude) in decimal degrees.
        destination: (latitude, longitude) in decimal degrees.

    Returns:
        Distance in kilometres, using a spherical Earth of radius 6371.0088 km.

    Raises:
        ValueError: If a latitude is outside [-90, 90] or a longitude outside [-180, 180].
    """
    lat1, lon1 = _validated(origin)
    lat2, lon2 = _validated(destination)
    half_chord = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(min(1.0, sqrt(half_chord)))


def _validated(point: Tuple[float, float]) -> Tuple[float, float]:
    latitude, longitude = point
    if not -90 <= latitude <= 90:
        raise ValueError(f"latitude {latitude} is outside [-90, 90]")
    if not -180 <= longitude <= 180:
        raise ValueError(f"longitude {longitude} is outside [-180, 180]")
    return radians(latitude), radians(longitude)
