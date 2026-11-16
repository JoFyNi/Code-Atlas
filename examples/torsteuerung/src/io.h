#ifndef IO_H
#define IO_H

#define EINGANG_ENDLAGE_OBEN   0
#define EINGANG_ENDLAGE_UNTEN  1
#define EINGANG_LICHTSCHRANKE  2
#define EINGANG_TASTER_AUF     3
#define EINGANG_TASTER_ZU      4
#define AUSGANG_MOTOR          0
#define AUSGANG_RICHTUNG       1

int io_lese(int kanal);
void io_schreibe(int kanal, int wert);

#endif
