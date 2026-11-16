#include "tor.h"
#include "motor.h"
#include "sensor.h"

static TorZustand zustand = TOR_ZU;
static int laufzeit_ms = 0;

#define MAX_LAUFZEIT_MS 12000

void tor_init(void)
{
    zustand = TOR_ZU;
    laufzeit_ms = 0;
    motor_stopp();
}

void tor_auf(void)
{
    if (zustand == TOR_ZU || zustand == TOR_SCHLIESST) {
        zustand = TOR_OEFFNET;
        laufzeit_ms = 0;
        motor_start(MOTOR_AUF);
    }
}

void tor_zu(void)
{
    if (zustand == TOR_OFFEN || zustand == TOR_OEFFNET) {
        zustand = TOR_SCHLIESST;
        laufzeit_ms = 0;
        motor_start(MOTOR_ZU);
    }
}

void tor_zyklus(void)
{
    laufzeit_ms += 10;
    if (zustand == TOR_OEFFNET && sensor_endlage_oben()) {
        motor_stopp();
        zustand = TOR_OFFEN;
    } else if (zustand == TOR_SCHLIESST && sensor_endlage_unten()) {
        motor_stopp();
        zustand = TOR_ZU;
    } else if (zustand == TOR_SCHLIESST && sensor_lichtschranke()) {
        tor_auf();
    }
    if (laufzeit_ms > MAX_LAUFZEIT_MS && (zustand == TOR_OEFFNET || zustand == TOR_SCHLIESST)) {
        motor_stopp();
        zustand = TOR_STOERUNG;
    }
}

TorZustand tor_zustand(void)
{
    return zustand;
}
