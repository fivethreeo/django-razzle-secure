import path from 'path';
import React from 'react';
import express from 'express';
import ssrPrepass from 'react-ssr-prepass';
import bodyParser from 'body-parser';

import {
  Client,
  dedupExchange,
  cacheExchange,
  fetchExchange,
  ssrExchange,
  Provider
} from 'urql';

import { renderToString } from 'react-dom/server';
import { ChunkExtractor } from '@loadable/server'
import { Router, Route } from 'react-router-dom';
import Cookies from 'universal-cookie';
import { createMemoryHistory } from 'history';
import queryString from 'query-string';
import UrqlDataComponent from '../utils/UrqlDataComponent';
import { QueryParamProvider } from 'use-query-params';
import CookieContext from '../utils/CookieContext';
import { createSSRCache } from '../utils/SSRCache';

import ClientConfig from '../config/components/ClientConfig';
import App from '../components/App';

import security from './middleware/security';
import config from '../config';

import ActivateExpressView from '../auth/ActivateExpressView';
import RegisterExpressView from '../auth/RegisterExpressView';
import LoginExpressView from '../auth/LoginExpressView';

const assets = require(process.env.RAZZLE_ASSETS_MANIFEST);

const server = express();

const SSRCacheMiddleware = (req, res, next)=>{
  res.locals.SSRCache = createSSRCache();
  next();
};

const UniversalCookiesMiddleware = (req, res, next)=>{
  res.locals.UniversalCookies = new Cookies(req.headers.cookie);
  next();
};

const urqlClientMiddleware = (req, res, next)=>{
  res.locals.urqlSSRCache = ssrExchange();
  res.locals.urqlClient = new Client({
    fetchOptions: () => {
      const token = res.locals.UniversalCookies.get('authToken');
      if (token) {
        return {
          headers: {
            Authorization: `JWT ${token}`
          }
        };
      }
      return {};
    },
    exchanges: [
      dedupExchange,
      cacheExchange,
      // Put the exchange returned by calling ssrExchange after your cacheExchange,
      // but before any asynchronous exchanges like the fetchExchange:
      res.locals.urqlSSRCache,
      fetchExchange,
    ],
    url: config('GRAPHQL_URL'),
    suspense: true
  });
  next();
};

server
  .disable('x-powered-by')
  .use(...security)
  .use(bodyParser.urlencoded({ extended: false }))
  .use(bodyParser.json())
  .use(...[SSRCacheMiddleware, UniversalCookiesMiddleware, urqlClientMiddleware])
  .use(express.static(process.env.RAZZLE_PUBLIC_DIR))
  
  .use('/register', RegisterExpressView)
  .use('/activate', ActivateExpressView)
  .use('/login', LoginExpressView)

  .use( async (req, res) => {

    const [SSRCache, UniversalCookies, urqlSSRCache, urqlClient] = [
      res.locals.SSRCache,
      res.locals.UniversalCookies,
      res.locals.urqlSSRCache,
      res.locals.urqlClient
    ];
    //console.log(req.originalUrl)
    //console.log(req.url)
    const history = createMemoryHistory({
      initialEntries: [req.url]
    });

    // This is the stats file generated by webpack loadable plugin
    const statsFile = path.resolve('./build/loadable-stats.json')
    // We create an extractor from the statsFile
    const extractor = new ChunkExtractor({ statsFile, entrypoints: ['client']})
    // Wrap your application using "collectChunks"
    const jsx = extractor.collectChunks(
      <SSRCache.Provider>
        <Provider value={urqlClient}>
          <CookieContext.Provider value={UniversalCookies}>
            <Router history={history} >
              <QueryParamProvider ReactRouterRoute={Route}>
                <App />
              </QueryParamProvider>
            </Router>
          </CookieContext.Provider>
        </Provider>
      </SSRCache.Provider>
    )
  
    // Suspense prepass    
    await ssrPrepass(jsx);

    const urqlData = urqlSSRCache.extractData();
      // Render your application
    const markup = renderToString(jsx)
    // You can now collect your script tags
    const scriptElements = extractor.getScriptElements({nonce: res.locals.nonce}) // or extractor.getScriptElements();
    // You can also collect your "preload/prefetch" links
    const linkElements = extractor.getLinkElements({nonce: res.locals.nonce}) // or extractor.getLinkElements();
    // And you can even collect your style tags (if you use "mini-css-extract-plugin")
    const styleElements = extractor.getStyleElements({nonce: res.locals.nonce}) // or extractor.getStyleElements();


    const html = renderToString(<html lang="">
      <head>
          <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
          <meta charSet='utf-8' />
          <title>Welcome to Razzle</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          {linkElements} 
          {styleElements}
      </head>
      <body>
          <div id="root">DO_NOT_DELETE_THIS_YOU_WILL_BREAK_YOUR_APP</div>
          <ClientConfig nonce={res.locals.nonce} />
          <UrqlDataComponent data={urqlData} nonce={res.locals.nonce} />
          <SSRCache.Component nonce={res.locals.nonce} />
          {scriptElements}
      </body>
    </html>);

    res.send(
      // prettier-ignore
      `<!doctype html>${html.replace('DO_NOT_DELETE_THIS_YOU_WILL_BREAK_YOUR_APP', markup)}`
    );
  });

export default server;
