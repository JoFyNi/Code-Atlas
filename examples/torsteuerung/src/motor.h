#ifndef MOTOR_H
#define MOTOR_H

typedef enum { MOTOR_AUF, MOTOR_ZU } MotorRichtung;

void motor_start(MotorRichtung richtung);
void motor_stopp(void);
int motor_laeuft(void);

#endif
