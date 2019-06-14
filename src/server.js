import path from 'path';
import React from 'react';
import express from 'express';
import { renderToString } from 'react-dom/server';
import { ChunkExtractor } from '@loadable/server'
import { Router } from 'react-router-dom';
import Cookies from 'universal-cookie';
import { createMemoryHistory } from 'history';
import { ApolloProvider } from "react-apollo";
import { ApolloProvider as ApolloHooksProvider } from "react-apollo-hooks";
import CookieProvider from './utils/Cookies';
import { getApolloClient } from './utils/apolloUtils';
import ClientConfig from './config/components/ClientConfig';
import App from './components/App';

import security from '../razzle-plugins/security/middleware';

const assets = require(process.env.RAZZLE_ASSETS_MANIFEST);

const server = express();

server
  .disable('x-powered-by')
  .use(...security)
  .use(express.static(process.env.RAZZLE_PUBLIC_DIR))
  .get('/*', async (req, res) => {

    const cookies = new Cookies(req.headers.cookie);

    const history = createMemoryHistory({
      initialEntries: [req.url]
    });

    const client = getApolloClient({ history, cookies });
    
    // This is the stats file generated by webpack loadable plugin
    const statsFile = path.resolve('./build/loadable-stats.json')
    // We create an extractor from the statsFile
    const extractor = new ChunkExtractor({ statsFile, entrypoints: ['client']})
    // Wrap your application using "collectChunks"
    const jsx = extractor.collectChunks(
      <CookieProvider value={cookies}>
        <ApolloProvider client={client} >
          <ApolloHooksProvider client={client} >
            <Router history={history} >
              <App />
            </Router>
          </ApolloHooksProvider>
        </ApolloProvider>
      </CookieProvider>)
    // Render your application
    const markup = renderToString(jsx)
    // You can now collect your script tags
    const scriptTags = extractor.getScriptTags({nonce: res.locals.nonce}) // or extractor.getScriptElements();
    // You can also collect your "preload/prefetch" links
    const linkTags = extractor.getLinkTags({nonce: res.locals.nonce}) // or extractor.getLinkElements();
    // And you can even collect your style tags (if you use "mini-css-extract-plugin")
    const styleTags = extractor.getStyleTags({nonce: res.locals.nonce}) // or extractor.getStyleElements();

    const configTag = renderToString(<ClientConfig nonce={res.locals.nonce} />)

    res.send(
      // prettier-ignore
      `<!doctype html>
<html lang="">
  <head>
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta charSet='utf-8' />
      <title>Welcome to Razzle</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      ${linkTags} 
      ${styleTags}
  </head>
  <body>
      <div id="root">${markup}</div>
      ${configTag}
      ${scriptTags}
  </body>
</html>`
    );
  });

export default server;
