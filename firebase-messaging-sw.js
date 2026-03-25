/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyDqf9hfsOCbZf_e3wo8lCagMoeUifJChPw",
  authDomain: "punto-84646.firebaseapp.com",
  projectId: "punto-84646",
  storageBucket: "punto-84646.firebasestorage.app",
  messagingSenderId: "606839701326",
  appId: "1:606839701326:web:62e5fb3ab9db3480c4281f"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Ricevuto messaggio FCM in background: ', payload);
  // Legge da payload.data (data-only message) per evitare duplicati
  const notificationTitle = payload.data?.title || 'Nuovo Promemoria da punto!';
  const notificationOptions = {
    body: payload.data?.body || '',
    icon: 'punto_icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
