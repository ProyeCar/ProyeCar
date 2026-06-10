// ============================================================
//  CARDIQUE Inspector SST — Service Worker v1.0
//  Estrategia: Cache-First para assets, Network-First para datos
// ============================================================

const CACHE_NAME     = 'cardique-v1';
const SYNC_QUEUE_KEY = 'cardique-sync-queue';

// Assets que se cachean al instalar
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json'
];

// ── INSTALL: precachear assets esenciales ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar cachés viejos ───────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Cache-First para html/assets ───────────────────
self.addEventListener('fetch', event => {
  // Solo interceptar GET del mismo origen
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(response => {
          // Cachear respuestas válidas
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Sin red y sin caché → página offline de fallback
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// ── BACKGROUND SYNC: enviar datos pendientes ──────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-inspecciones') {
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // En Fase 3 (backend) aquí se enviarán los datos al servidor.
  // Por ahora solo notificamos al cliente que la sync fue exitosa.
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_COMPLETE', timestamp: Date.now() });
  });
}

// ── PUSH NOTIFICATIONS (preparado para Fase 3) ────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'CARDIQUE Inspector', {
      body:    data.body    || 'Notificación de inspección',
      icon:    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAABmJLR0QA/wD/AP+gvaeTAAAU8ElEQVR4nO3de3RV5Z3G8e+798k5OUlOLgSSgLkBQZRbuFUhKHi31uWFtrTTutROL45t7Uwvq7WtXaur09VaO+0a11RrnWVHW6c6o7V10NZqFREhKGOAgBHCNSQBAiEk4eR2bvudP4BOAglJzt7nlvP7rOVakHP2u1/D++z9vvt9996KBKhYuWC6DrNEKy5WWl0CugqMItBZQDaQm4h6iZjrArqVUt1a63YF9VrretM06w+68hpYvz4c7wqpeOxk9orZvgHLewtKX6fhaqAyHvsVKeUk8Ge0Wuu2PK/ue/fdU/HYaewCsGaNWda65zqluBNYDWTFbF9iohnQ8IyJ+kVT7fbtsdyR4wGYO3euuyffvFNrdT8wy+nyRbpRG7TWP27ZXP9qTEp3sCyjfHn1F1A8AJQ5WK4QAK+ZhvGtgxu31TtZqCMBKFuxaKnSkcdALXWiPCFGYKH5935P+Jvt6xt6nCjQVgCqbqryBLtzHgL9FcBwokJCjMEBDO5u3li/0W5BZrQbli5fXGUFXH/h9AA3LleThDijAM1n8suK3d0tx9YDOtqComq4FcurV2vFU8j1epFompe8xsAdjZsa/dFsPu4AlK2ovldpHsHG2UMIh71vWOqWpne2N413w3H128trqu9XmseQxi+SyzzL1Jsrli2+dLwbjjkA5TULvg/8ZLw7ECIuNCXajKwrv3LRnPFsNqYu0Jluz2PR1UyIuDqqiVzZUvv+/rF8edQAnBnwPo90e0Tq2I1h1TRv3Nk52hcv2AUqq5k3UyueRBq/SC2XYJkvVt1U5Rnti66RPjg9yWU+B+Q5WrURqEwDs8SNq8CNynVh5JjgMVCmQrlkmiEV6bBGBy10wEKfChM5GSLSHiJyMgQ66kv3Y937ymBX9sPAFy/0rRFbVnnNwodB/5Pj9Rq88ywDd2UWrkovRt6IWRQTjO6PED4cILi3F6srtrcAKMXHDm2q/8OInw/3w/Ir5i/BMt4lRl0fc1IG7jk5uEo9oOTons7Cx4ME3+8hciwQq110mRgLD9ZuOzTch8Mddg0s9Sti0PhVtknm4lxcpZlOFy1SlKvIjeuaSYSPBAhsPYXld/yMkB/B+jVw3XAfntfIy5dX34NS9zhaBQXuS3PwrijAzM9wtGgxMRg+FxkzsyCkT48RnDUjt6y48VTLsffP/WBI/2PJkiUZ7Z7wXqDCqT0rj4F3eR7mVDnqi7EJHwkwUNuFDlnOFapocw24LjlQV9c9+MdDLoOeyAzdhYON3/CZZN1QKI1fjItrmoesGwsxfA72wjUlYU/4O+f++P/PAGvWmOWH9+zCodsYjYIMsq6ahMqU2wREdPSARd+6Dqxux8YFPWG3a/qR9XUnzv7gb62ztLXxepxq/D5TGr+wTWUaZF1T6OQl8hxXIPL1wT/4WwtVBnc6sQfDY+CVxi8cojINsq4qdK49KX1f5VUL88/+1QCouvzyXKXV7fYLV2Quz8PIkUkt4RyVdeagajoyZ+SLBPn02b8YACFX4BYceG6P+5JsGfCKmDALMnAvduYGRIX+3Nk/GwCW1tfYLjTbxD0vx24xQozIXZXl1CTq4orl1YvgTAAU2A5A5uI8WbQmYi5zaR647I8HNNwOYFSsXDAdm8/qNCdlnF7XI0SMKa+BZ4EDPQ3FTQCGDrPEblnuudL1EfHjnpWNyrY9SbZkZs2CIkNjzLZTipFl4rpIjv4ijgxwz7F90DWC2qgxFNpWADIqvbKkWcSde4YX5bE3FjCUnmdom7O/rkqvrUoIERVDnT742qA18w0FhdEWoDINjFyZ9BKJkTHD5tSV4mIDhS/a7c0StzwVVCSMke/CyLI1GC4w0EQ9mjAL3HZ2LoRtZomtCzD5BjaWQEj3RySaUWjrDkOfgY3n+jt6w4IQUTDtLZU27F1HcsuSZ5FYdifEbLVgWfsjEk3ZPAjbC4Az67OFiJrdg7D0YURakwCItCYBEGlNAiDSmgRApDUJgEhrspYhYVzk5FzEzIJplOUWU5IzicneXPLc2WS7M/GYLlwKLCtEMBJiINRDV38XHX2dHD91lKauVg51tdEeiiT6fySlSQDixcylsmQhNaXzWVxyKfOLypnqybB1CtY6QEfXPna27Wb7kXo2N+9kd+8ADj5SdsJT5TXVUb+rxvepqU7WZeIxfFSVreKWi1dyw/Q5lLrNmK4e1wQ52bGDdfve4i97N/O/Xb1pEQb/s0ej3lYCEANG5nSunbuau+avYmGOO0G3TARpO7qB3+98mRf2N9I+gXtKEoAkodxlXLvwLu6rrmGmx0iSe4U0wd4PeGnbf/FEQx0toVi/nC7+JAAJ52XGrDv43opb+VBORpI0/HNpAod/xa0vruXwBMuAnQDIINgmI3MOd179Db4ycxrJ/VRUhenyIC+oGkoCEDVFbvFqfvzhz7DKl6xHfTEaCUBUXFxUdR+PXnsDVRnS9FOZBGDc3FTN+za/WrmMEkMaf6qTAIyLi8o59/P4ymUUS+OfEGQt0JgpJk//Mo+sWi6NfwKRM8AYuSfdzk+vu5HKGN8GqgnT33eCw6faORHsoz8UIqxcZLo8eDNymeKbQkmWD4+hZODtAAnAWGTM4Us3fIYPeWLR5DT9/l28ta+WDa07qWs7wOHAKK8FNbwU5c9gTtEs5k+tpqa8mrk+r5zOoyABGJWXpZd/lbsnO72kIcixI2/w1Hu/54WWI/SNZ3LK6uf4yQaOn2xg/e4X+QUuCgoX8+FLrue2iy9jbnaill+kHgnAKDzFn+C780sdnEDShHp38ru3H+GX+1roc6TMMJ0dW3h20xae3ZzP3Fm38tlFN3Pd5Fzk0WUXJgG4EDWNNTW3M8uxfr9FR+uzfOu1Z3i3L0brNK0uGhp/yzcan2fGzDV8fflqVuVnyhlhBNJtHJHCV/kpPjvNqcYT5si+f+Wul/4zdo1/iH4O7P8t9z17D1+o3cDBCbgIzglyBhiJmsZHF69kiiOt36L94KPc89fXORTvZcmRdt7Z+iBr9r/F5+d4CMV598lOAjACd8lNfKLEicGkJnhyLd95/VWaErgmf6C7lkc2J27/yUq6QMPysuzSayhz4OivIwd58vUneScgXZBkJAEYjnshH5mR78AvJ0LTzsd44njQgUqJWJAADCProhWscGDSyxrYwuNbG+h3oE4iNiQA58mgumIhebbbf4TmD57ntXHNcIl4kwCcy6jgQ9Psd3+0dZCXdjcinZ/kJgE4h5F1CQvzHOj9H1/PK53p8FCS1CYBOIercBazbC93jnCwZduEu/l8IpIADGFQMqkcn932rzvY0trMBH4Uz4QhARjCoDS/2H7/P3KQDzqk+acCCcAQOUz15dj+pVj+JvYFpf+TCiQAg6l8irLsX/+P+Ns4KuPflCABGEzlkO+x3QGiv/ckPY5USMSaBGAwlUWO2/YImK7+U2nxVOaJQAIwRAYe27dQaYKRIDICSA0SgMGUiansnwGC4ZAEIEVIAAbT2pGui2HInbipQgIwRJiwZffYrfCY8rDcVCEBGCJAn+17BhVet9yEniokAIPpXvxBu50gRUF2gTyHP0VIAAbT3XT02+8CmVmTKZRTQEqQAAymuznWG7Z9BcfMr2C6/GZTgvwzDRHk8KkTtq8EGZ4KZvnkV5sK5F9pCIuWziOM8mja0RkVLCrJkYFwCpAADKHxdxyg1fZkgIdFZXOS/KV5AiQA54l07mGX7aXMityyFVzudqRKIoYkAOcK7ea94/aXMhjeZdxS4ZNuUJKTAJyniy0t++2PA1Q2Vy24nnJJQFKTAJxH03poC3ttjwMUnpLb+PuyLCcqJWJEAjAMq3MTr52wPx+AmsJtKz5JtTyCOGlJAIajW3lldwMB2wUpMgpv54Gls/E6UC3hPAnAsDRH9rzChgEnVvW7uXTxt3lgekGCB8QuCvOKyU5oHZKPBGAEeqCW3+w67MizfZRRwq3Xf59/vCgxV4WUewarr/o5L1zv1As/Jg4JwIhC7Nz+HG879Fx/wz2bz33kh3yjojB+L65Tucybcy9P3vEw/zzvYvKl8Z9HAnABVu+b/GL7PgfGAqcZntncffPDPLK0mqJY/uZVDrNm/h0//eQTPHPNbSzNlht0RiIBuKAwjdsf59lOB64InaGMyVy57EFeXPM17igtwuNQuQBmZjkr53+BRz/9FC/cdDcfmeyTf+BRyAW60YQaeOzN/+GK2z5KlWOvS1XkTrmB79x+NZ9r28DvP3iDP++vpykw3skHhSdrOksrlrKycgXXV86iyLE6pgcJwBj0Hnma79XN4z8um42z01oZFJVcy5dKruWLq/y0nNjFtqON7Ok8Squ/nRMDA/SHA0RUBh5XJlluH5NzipjqK6Z80gzmTplJVa4Pt+0nWaQvCcCYBHj/vZ/w4JSf84Ppk2LSrVCmj/LiyygvviwGpYuRSBdxrKw2Xvzrj3j8WJ8882cCkQCMgw5+wGMv/4in2/slBBOEBGCcrP6t/GztD3iirUee/zkBSACiYPXX829r7+dH+9ocmyMQiSEBiJIOHuC/X/0q99S+y5GIdIhSlQTADt1N3dYf8Ik/PMrajl7pEqUgCYBtmq5jf+K7z32RezatozFgJeEAWRPq3c1Lu7bTnnyVSyhVXlMd9a/E96mpTtZlQjAyZ3DTwjv4/LzLqco0E7wGx8LfWcfaHX/kt7u2cdj2fZ7Jyf/s0ai3lQDEiHJPY/nFN/HxOdewqmiSo2t+LkxjBY+x9eB6Xt71Kn9ubaMvbvtODAlAUjPx5c/j6pnLWVWxhMuLLyLf8fU6Fr3+fbzXUsfbTe/yZvMejoXTp69jJwCyFCLmIvi76llbV8/aOlCuAmYUXcKCoipmF1YwI38aZXnFlHi9ZIy6pkdjRfo44T9Kc1crBzsPsft4IzuP7WHPqV77T7JIQxKAONPhTvYf2cz+I5uHfmB4yPPmkefOIjsjE4/pwqUgYoUIRoIEQr109nfRGQjK1SYHSQCShRWgu/c43b2Jrkh6kcugIq1JAERakwCItCYBEGlNAiDSmgRApDUJgEhrEgCR1iQAIq1JAERakwCItCYBEGlNAiDSmgRApDUJgEhrEgCR1pL2hhiP18usBYuYVFxMhjt+t5QL50TCIdpaWthbv41IOJTo6gwrKQNgGCaLrrya7NzcRFdF2GC6Mrho+gyycnLYtmEdOgnv00/KLtDkqdOk8U8gBVOKKCxOzieIJGUAMrOcfQ+LSLwsX3Ie0JIyAJ0n2iEJHzAooufvPJnoKgwrKQPg7zxJ897GRFdDOORYS/OZg1ryScpBMMDe+u34OzspKi3HNOP2amnhoHAoRMexNo427U90VUaUtAEAaGs+RFvzoURXQ0xgSdkFEiJeJAAirUkARFqTAIi0JgEQaU0CINKaBECkNQmASGu2AqDT6D1UIjnZbYP2zgAhCYBIsJC9F0bZCoDVG7G1cyHs0kH7Z4CoI2R1J+dtbiJ9WD223o1pGYA/2q0jHRIAkViW31YvpNfQ6O5otw4fHbCzcyFss+wdhP2GoYyuaLfWfRaRTjkLiATRED4esFOC39BoW7dehZv67WwuRNSs7jB6wNZVoA4DeN9OCeGD/WDJ5VARf6FDtg++ewxlsdNOCVbAInRAzgIizrS23/vQNBoBl7ERG5dCAQINfjkLiLgKtw5g9dmbh1LQaLS9va0d9FY7Bek+i+DePluVEWLMNAQaem0XY5quOuN0eeovdgsL7PSj++1NSwsxFuHWASz7Vx/3HdhY12wAGJb+o+1ahTQD70U9pSDEmOiwJrD1lBMlvQln1gIdemfHVmC73SLDrQME99o/NQkxkuBOv+2+P4BW6g0YtBhOKX5tu1QguM0vk2MiJsKHAwQbHTjAanoHMsJ/gkEB0Mr6HdBju+yIpn/9SXSfjAeEcyx/hIF3O515ZKyhXmhf39ADgwLQvHFnJ/CoA8WjByz61nfYnaUTAgDdHzl9UA04dKk9op4++8ch9wMETePnaBzpxFvdYfrWSQiEPbo/Qv9bnXaXPQ/W2PzOtnVn/zIkAGfmBH7p1J6s7jB9r5/AOuVY5UUasfwR+l4/6eyYUqkHGTTxe94dYV4j8EPgiFP7s/wR+l7rICJLp8U4hA8H6Ptru5NHfjS6ecqA+czgn5333PGOlo5gfunUNhQfc2zPliZ0aAAd0JhFbpShHCtaTCw6rAnW+09f63e846C+tnvLtrohPxnpq+U11W8A1zhdBcNn4lmci2taptNFi1SmT88jBbaecuQ6/zA72Nxcu+MKzln3NuL7ASIRfbdpqnpgkpPVsPynBzVmkRvPfB9mkdvJ4kWq0Zpwa4BAQ48TyxtGElFafZlhFn1esC9SXrPg46Cej1WtAMz8DFxVWWSUZqK88pyutKBPXyAJHeon3NQfoyP+oN0p9bOWTdu/Odxno3bGy2uqHwfucbxWw9TEnJSBWeTByHNhFmSAW6HcBsolY4ZUpMMawhodsLB6wlj+CFZHiPDxQDwvj2/xdYevbGhoCA734agta8mSJRntnvArwLWOV02I2OpSLr340IYdB0f6wpgOraXL504ylKsWmO1Y1YSIrTCa1c2b61++0JfG1Olu3dxwUhO5GTjqSNWEiC2tlL53tMYP43g0Ykvt+/sjBlcBh+3UTIhY00p/79CmHWNa3Tzu0WXlsoWVlqHfBCrHu60QcfBQc239t8f65agur5wJwVpgfjTbCxEDYaX0vWM98p8V1YX3pne2N3nVwApQa6PZXgiHdaFZPd7GD8OsBRqrjpaOYHdL23P5ZcUuUCuQt82IxNiiXPr65k07tkSzsSMzTOXLFq7A4DegZzpRnhBjENZKPZzbFXpgpEmusXBsinXKVXNzsoLmQxr1D9g4swgxOr3ZwPhSU+122w9ycHyNQeny+fMNZfwLcKPTZYs0pzmoFT9sqa1/CmfuDnY+AGeV1VTfYKC/q1GrYrUPkTYaUerBKQPmM3V1dY4uGY35KrPpVyyqjlj6PtB3AN5Y709MGD0o9Qci6ukz9/DGZPVc3JZZnhkj3KiVcSvauhlUYbz2LVKF2g/WOq3UG0G/fvnYjh0xf8paYtYZr1ljljbvmmuY5gKtVLXSuhqYAuQP+k9MPKeAHgU9Gk4Ae9A0KoM9pnK9d2BjXXO8K/R/S2af9p9i2gEAAAAASUVORK5CYII=',
      badge:   'data:image/png;base64,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',
      tag:     data.tag     || 'cardique-notif',
      data:    data.url     || './',
      vibrate: [100, 50, 100]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || './')
  );
});
