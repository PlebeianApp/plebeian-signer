export type Nip07Method =
  | 'signEvent'
  | 'getPublicKey'
  | 'getRelays'
  | 'nip04.encrypt'
  | 'nip04.decrypt'
  | 'nip44.encrypt'
  | 'nip44.decrypt';

export type Nip07MethodPolicy = 'allow' | 'deny';

export type WeblnMethod =
  | 'webln.enable'
  | 'webln.getInfo'
  | 'webln.sendPayment'
  | 'webln.makeInvoice'
  | 'webln.keysend';

export type ExtensionMethod = Nip07Method | WeblnMethod;
