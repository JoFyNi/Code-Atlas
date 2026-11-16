#include <stdio.h>
#include "tor.h"
#include "io.h"

static void bedienung(void)
{
    if (io_lese(EINGANG_TASTER_AUF)) {
        tor_auf();
    }
    if (io_lese(EINGANG_TASTER_ZU)) {
        tor_zu();
    }
}

int main(void)
{
    tor_init();
    for (int takt = 0; takt < 2000; takt++) {
        bedienung();
        tor_zyklus();
    }
    printf("Zustand: %d\n", tor_zustand());
    return 0;
}
