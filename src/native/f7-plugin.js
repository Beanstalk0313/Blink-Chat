import Framework7Lite from 'framework7/lite';
import f7ReactPlugin from 'framework7-react';

// In Framework7 v9 the framework7-react ESM build ships its default export as
// a plugin object. Registering it on the same lite class the plugin itself uses
// creates the shared f7events emitter that every f7 component needs. This must
// run before the first Framework7 instance is created.
// eslint-disable-next-line react-hooks/rules-of-hooks
Framework7Lite.use(f7ReactPlugin);
