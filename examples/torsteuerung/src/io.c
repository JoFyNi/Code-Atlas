#include "io.h"

static int eingaenge[8];
static int ausgaenge[8];

int io_lese(int kanal)
{
    return eingaenge[kanal & 7];
}

void io_schreibe(int kanal, int wert)
{
    ausgaenge[kanal & 7] = wert;
}
