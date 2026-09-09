import { GamePhase } from '@fps/shared';

export class MatchStateMachine {
  public phase: GamePhase = GamePhase.LOBBY;
  public remainingSeconds: number = 0;
  private timer: any = null;

  public transitionTo(newPhase: GamePhase, durationSeconds: number = 0): void {
    this.phase = newPhase;
    this.remainingSeconds = durationSeconds;

    if (this.timer) clearInterval(this.timer);

    if (durationSeconds > 0) {
      this.timer = setInterval(() => {
        this.remainingSeconds--;
        if (this.remainingSeconds <= 0) {
          clearInterval(this.timer!);
          this.timer = null;
          this.onPhaseComplete();
        }
      }, 1000);
    }
  }

  private onPhaseComplete(): void {
    switch (this.phase) {
      case GamePhase.WARMUP:
        this.transitionTo(GamePhase.PLAYING, 600); // 10 minutes match
        break;
      case GamePhase.PLAYING:
        this.transitionTo(GamePhase.ROUND_END, 10);
        break;
      case GamePhase.ROUND_END:
        this.transitionTo(GamePhase.POST_GAME, 15);
        break;
      case GamePhase.POST_GAME:
        this.transitionTo(GamePhase.LOBBY, 0);
        break;
      default:
        break;
    }
  }
}
