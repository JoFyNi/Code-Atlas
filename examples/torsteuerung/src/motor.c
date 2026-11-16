#include "motor.h"
#include "io.h"

static int laeuft = 0;

void motor_start(MotorRichtung richtung)
{
    io_schreibe(AUSGANG_RICHTUNG, richtung == MOTOR_AUF ? 1 : 0);
    io_schreibe(AUSGANG_MOTOR, 1);
    laeuft = 1;
}

void motor_stopp(void)
{
    io_schreibe(AUSGANG_MOTOR, 0);
    laeuft = 0;
}

int motor_laeuft(void)
{
    return laeuft;
}
