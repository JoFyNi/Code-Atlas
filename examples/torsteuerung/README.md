# Example: gate controller (Torsteuerung)

A small roller-gate controller in C: push buttons, end positions, light barrier, motor. Good for trying out CodeAtlas. The code itself uses German names (*Tor* = gate, *Notaus* = emergency stop).

```bash
python codeatlas_bridge.py examples/torsteuerung --desktop
```

Requests to try:

- "Add an emergency stop that halts the motor immediately and has to be acknowledged."
- "Write tests for the gate controller and run them in the atlas."
- "When the gate has been open for 30 seconds it should close automatically."
- "Explain how `tor_zyklus()` switches states." (mode *Plan*)

Run it: **▶ run** below a request, or in the advanced view Console → *Run* (needs `gcc`).

---

**Deutsch:** Kleine Steuerung eines Rolltors in C (Taster, Endlagen, Lichtschranke, Motor). Starten wie oben, dann z. B.: „Baue einen Notaus ein, der den Motor sofort stoppt und quittiert werden muss.“
