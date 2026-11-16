#ifndef TOR_H
#define TOR_H

typedef enum { TOR_ZU, TOR_OEFFNET, TOR_OFFEN, TOR_SCHLIESST, TOR_STOERUNG } TorZustand;

void tor_init(void);
void tor_auf(void);
void tor_zu(void);
void tor_zyklus(void);
TorZustand tor_zustand(void);

#endif
