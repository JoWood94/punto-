import { Component, signal, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastContainerComponent } from './components/toast/toast-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('frontend');
  private translate = inject(TranslateService);

  ngOnInit() {
    // Set default lang immediately so UI strings are available before user pref loads
    this.translate.setDefaultLang('it');
    this.translate.use('it');

    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('splash-hidden');
      setTimeout(() => splash.remove(), 380);
    }
  }
}
