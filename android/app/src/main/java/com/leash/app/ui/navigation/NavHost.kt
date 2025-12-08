package com.leash.app.ui.navigation

import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.leash.app.data.AgentRepository
import com.leash.app.data.ConnectionSettings
import com.leash.app.data.LeashWebSocketClient
import com.leash.app.ui.screens.AgentDetailScreen
import com.leash.app.ui.screens.AgentListScreen
import com.leash.app.ui.screens.ConnectionScreen

object Routes {
    const val CONNECTION = "connection"
    const val AGENT_LIST = "agents"
    const val AGENT_DETAIL = "agents/{agentId}"

    fun agentDetail(agentId: String) = "agents/$agentId"
}

@Composable
fun LeashNavHost(navController: NavHostController) {
    val context = LocalContext.current
    val settings = remember { ConnectionSettings(context) }

    // Create repository with dynamic URL
    var repository by remember { mutableStateOf<AgentRepository?>(null) }

    // Determine start destination based on whether we have a saved connection
    val startDestination =
            if (settings.isConfigured) {
                // Auto-connect with saved URL and password
                repository =
                        AgentRepository(LeashWebSocketClient(settings.serverUrl, settings.password))
                Routes.AGENT_LIST
            } else {
                Routes.CONNECTION
            }

    NavHost(navController = navController, startDestination = startDestination) {
        composable(Routes.CONNECTION) {
            ConnectionScreen(
                    onConnected = { serverUrl ->
                        // Create new repository with the provided URL and password
                        repository =
                                AgentRepository(LeashWebSocketClient(serverUrl, settings.password))
                        navController.navigate(Routes.AGENT_LIST) {
                            popUpTo(Routes.CONNECTION) { inclusive = true }
                        }
                    }
            )
        }

        composable(Routes.AGENT_LIST) {
            repository?.let { repo ->
                AgentListScreen(
                        repository = repo,
                        onAgentClick = { agentId ->
                            navController.navigate(Routes.agentDetail(agentId))
                        },
                        onDisconnect = {
                            repo.disconnect()
                            repository = null
                            settings.clear()
                            navController.navigate(Routes.CONNECTION) {
                                popUpTo(Routes.AGENT_LIST) { inclusive = true }
                            }
                        }
                )
            }
        }

        composable(
                route = Routes.AGENT_DETAIL,
                arguments = listOf(navArgument("agentId") { type = NavType.StringType })
        ) { backStackEntry ->
            val agentId = backStackEntry.arguments?.getString("agentId") ?: return@composable
            repository?.let { repo ->
                AgentDetailScreen(
                        agentId = agentId,
                        repository = repo,
                        onBackClick = { navController.popBackStack() }
                )
            }
        }
    }
}
