#include "sensor.h"
#include "io.h"

int sensor_endlage_oben(void)
{
    return io_lese(EINGANG_ENDLAGE_OBEN);
}

int sensor_endlage_unten(void)
{
    return io_lese(EINGANG_ENDLAGE_UNTEN);
}

int sensor_lichtschranke(void)
{
    return !io_lese(EINGANG_LICHTSCHRANKE);
}
